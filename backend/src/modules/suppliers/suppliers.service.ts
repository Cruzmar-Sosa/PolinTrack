import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QuerySupplierDto) {
    const { isActive, includeInactive, search, page = 1, limit = 10 } = query;
    const isAll = limit === 0 || limit >= 10000;
    const skip = isAll ? undefined : (page - 1) * limit;
    const take = isAll ? undefined : limit;

    const where: Prisma.SupplierWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    } else if (includeInactive !== undefined) {
      if (!includeInactive) {
        where.isActive = true;
      }
    } else {
      where.isActive = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { legalId: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, suppliers] = await Promise.all([
      this.prisma.supplier.count({ where }),
      this.prisma.supplier.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const totalPages = isAll ? 1 : Math.ceil(total / limit) || 1;

    return {
      success: true,
      data: suppliers,
      meta: {
        total,
        page: isAll ? 1 : page,
        limit: isAll ? total : limit,
        totalPages,
      },
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        woodReceipts: {
          take: 10,
          orderBy: [{ receiptDate: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            lotNumber: true,
            receiptDate: true,
            quantity: true,
            unit: true,
            guideNumber: true,
            species: { select: { name: true } },
            woodType: { select: { name: true } },
          },
        },
        _count: {
          select: { woodReceipts: true },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Proveedor con identificador '${id}' no encontrado en el sistema`,
      });
    }

    return {
      success: true,
      data: supplier,
    };
  }

  async create(dto: CreateSupplierDto, userId: string) {
    const normalizedName = dto.name.trim();
    const normalizedLegalId = dto.legalId.trim();

    // 1. Validate name uniqueness
    const existingName = await this.prisma.supplier.findUnique({
      where: { name: normalizedName },
    });

    if (existingName) {
      throw new ConflictException({
        code: 'DUPLICATE_NAME',
        message: `Ya existe un proveedor registrado con el nombre '${normalizedName}'`,
      });
    }

    // 2. Validate RUC / legalId uniqueness
    const existingRuc = await this.prisma.supplier.findFirst({
      where: { legalId: normalizedLegalId },
    });

    if (existingRuc) {
      throw new ConflictException({
        code: 'DUPLICATE_RUC',
        message: `Ya existe un proveedor registrado con el RUC/Identificación fiscal '${normalizedLegalId}'`,
      });
    }

    // 3. Persist supplier
    const supplier = await this.prisma.supplier.create({
      data: {
        name: normalizedName,
        legalId: normalizedLegalId,
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
        documentUrl: dto.documentUrl?.trim() || null,
        isActive: true,
      },
    });

    // 4. Register audit log
    try {
      await this.prisma.auditLog.create({
        data: {
          tableName: 'suppliers',
          recordId: supplier.id,
          action: 'INSERT',
          newValues: {
            name: supplier.name,
            legalId: supplier.legalId,
            phone: supplier.phone,
            isActive: true,
          },
          userId,
        },
      });
    } catch (auditErr) {
      this.logger.warn(
        `No se pudo registrar AuditLog para proveedor ${supplier.id}: ${auditErr}`,
      );
    }

    return {
      success: true,
      data: supplier,
    };
  }

  async update(id: string, dto: UpdateSupplierDto, userId: string) {
    const current = await this.prisma.supplier.findUnique({
      where: { id },
    });

    if (!current) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `Proveedor con identificador '${id}' no encontrado`,
      });
    }

    // 1. If name changes, validate uniqueness against other suppliers
    let normalizedName: string | undefined;
    if (dto.name && dto.name.trim() !== current.name) {
      normalizedName = dto.name.trim();
      const duplicateName = await this.prisma.supplier.findFirst({
        where: {
          name: normalizedName,
          id: { not: id },
        },
      });

      if (duplicateName) {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `Ya existe un proveedor registrado con el nombre '${normalizedName}'`,
        });
      }
    }

    // 2. If legalId changes, validate uniqueness against other suppliers
    let normalizedLegalId: string | undefined;
    if (dto.legalId && dto.legalId.trim() !== current.legalId) {
      normalizedLegalId = dto.legalId.trim();
      const duplicateRuc = await this.prisma.supplier.findFirst({
        where: {
          legalId: normalizedLegalId,
          id: { not: id },
        },
      });

      if (duplicateRuc) {
        throw new ConflictException({
          code: 'DUPLICATE_RUC',
          message: `Ya existe un proveedor registrado con el RUC/Identificación fiscal '${normalizedLegalId}'`,
        });
      }
    }

    // 3. Update supplier record
    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(normalizedName ? { name: normalizedName } : {}),
        ...(normalizedLegalId !== undefined
          ? { legalId: normalizedLegalId }
          : dto.legalId !== undefined
          ? { legalId: dto.legalId?.trim() || null }
          : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.documentUrl !== undefined
          ? { documentUrl: dto.documentUrl?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    // 3. Register audit log
    try {
      const isStatusChange =
        dto.isActive !== undefined && dto.isActive !== current.isActive;
      await this.prisma.auditLog.create({
        data: {
          tableName: 'suppliers',
          recordId: id,
          action: isStatusChange ? 'UPDATE_STATUS' : 'UPDATE',
          oldValues: {
            name: current.name,
            legalId: current.legalId,
            isActive: current.isActive,
          },
          newValues: {
            name: updated.name,
            legalId: updated.legalId,
            isActive: updated.isActive,
          },
          userId,
        },
      });
    } catch (auditErr) {
      this.logger.warn(
        `No se pudo registrar AuditLog para update de proveedor ${id}: ${auditErr}`,
      );
    }

    return {
      success: true,
      data: updated,
    };
  }
}
