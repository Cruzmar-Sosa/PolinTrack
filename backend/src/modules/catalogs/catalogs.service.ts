import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateClientCenterDto, UpdateClientCenterDto } from './dto/client-center.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateWoodSpeciesDto, UpdateWoodSpeciesDto, UpdateWoodTypeDto } from './dto/wood-catalog.dto';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==============================================================================
  // 1. CENTROS DE DESTINO / PLANTAS CLIENTE
  // ==============================================================================

  async findAllClientCenters(includeInactive = false) {
    return this.prisma.clientCenter.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createClientCenter(dto: CreateClientCenterDto, userId: string) {
    const existing = await this.prisma.clientCenter.findUnique({
      where: { name: dto.name.trim() },
    });

    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_NAME',
        message: `Ya existe un centro de destino con el nombre '${dto.name.trim()}'`,
      });
    }

    const clientCenter = await this.prisma.clientCenter.create({
      data: {
        name: dto.name.trim(),
        location: dto.location?.trim() || null,
        isActive: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tableName: 'client_centers',
        recordId: clientCenter.id,
        action: 'INSERT',
        newValues: clientCenter as any,
        userId,
      },
    });

    return clientCenter;
  }

  async updateClientCenter(id: string, dto: UpdateClientCenterDto, userId: string) {
    const current = await this.prisma.clientCenter.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Centro de destino con ID '${id}' no encontrado`,
      });
    }

    if (dto.name && dto.name.trim() !== current.name) {
      const duplicate = await this.prisma.clientCenter.findUnique({
        where: { name: dto.name.trim() },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `Ya existe otro centro de destino con el nombre '${dto.name.trim()}'`,
        });
      }
    }

    const updated = await this.prisma.clientCenter.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.location !== undefined && { location: dto.location?.trim() || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tableName: 'client_centers',
        recordId: id,
        action: 'CORRECTION',
        oldValues: current as any,
        newValues: updated as any,
        userId,
      },
    });

    return updated;
  }

  async updateClientCenterStatus(id: string, isActive: boolean, userId: string) {
    return this.updateClientCenter(id, { isActive }, userId);
  }

  // ==============================================================================
  // 2. PRODUCTOS / POLINES NORMALIZADOS
  // ==============================================================================

  async findAllProducts(includeInactive = false) {
    return this.prisma.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { dimensions: 'asc' },
    });
  }

  async createProduct(dto: CreateProductDto, userId: string) {
    const existing = await this.prisma.product.findUnique({
      where: { name: dto.name.trim() },
    });

    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_NAME',
        message: `Ya existe un producto con el nombre '${dto.name.trim()}'`,
      });
    }

    const product = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        dimensions: dto.dimensions.trim(),
        isActive: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tableName: 'products',
        recordId: product.id,
        action: 'INSERT',
        newValues: product as any,
        userId,
      },
    });

    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto, userId: string) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Producto con ID '${id}' no encontrado`,
      });
    }

    if (dto.name && dto.name.trim() !== current.name) {
      const duplicate = await this.prisma.product.findUnique({
        where: { name: dto.name.trim() },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `Ya existe otro producto con el nombre '${dto.name.trim()}'`,
        });
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.dimensions && { dimensions: dto.dimensions.trim() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tableName: 'products',
        recordId: id,
        action: 'CORRECTION',
        oldValues: current as any,
        newValues: updated as any,
        userId,
      },
    });

    return updated;
  }

  async updateProductStatus(id: string, isActive: boolean, userId: string) {
    return this.updateProduct(id, { isActive }, userId);
  }

  // ==============================================================================
  // 3. ESPECIES DE MADERA
  // ==============================================================================

  async findAllWoodSpecies(includeInactive = false) {
    return this.prisma.woodSpecies.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createWoodSpecies(dto: CreateWoodSpeciesDto, userId: string) {
    const existing = await this.prisma.woodSpecies.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_NAME',
        message: `Ya existe una especie de madera con el nombre '${dto.name}'`,
      });
    }

    const species = await this.prisma.woodSpecies.create({
      data: {
        name: dto.name,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tableName: 'wood_species',
        recordId: species.id,
        action: 'INSERT',
        newValues: species as any,
        userId,
      },
    });

    return species;
  }

  async updateWoodSpecies(id: string, dto: UpdateWoodSpeciesDto, userId: string) {
    const current = await this.prisma.woodSpecies.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Especie de madera con ID '${id}' no encontrada`,
      });
    }

    if (dto.name && dto.name !== current.name) {
      const duplicate = await this.prisma.woodSpecies.findUnique({
        where: { name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'DUPLICATE_NAME',
          message: `Ya existe otra especie de madera con el nombre '${dto.name}'`,
        });
      }
    }

    const updated = await this.prisma.woodSpecies.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tableName: 'wood_species',
        recordId: id,
        action: 'CORRECTION',
        oldValues: current as any,
        newValues: updated as any,
        userId,
      },
    });

    return updated;
  }

  async updateWoodSpeciesStatus(id: string, isActive: boolean, userId: string) {
    return this.updateWoodSpecies(id, { isActive }, userId);
  }

  // ==============================================================================
  // 4. TIPOS DE MADERA
  // ==============================================================================

  async findAllWoodTypes(includeInactive = false) {
    return this.prisma.woodType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async updateWoodType(id: string, dto: UpdateWoodTypeDto, userId: string) {
    const current = await this.prisma.woodType.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Tipo de madera con ID '${id}' no encontrado`,
      });
    }

    const updated = await this.prisma.woodType.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.defaultUnit && { defaultUnit: dto.defaultUnit }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tableName: 'wood_types',
        recordId: id,
        action: 'CORRECTION',
        oldValues: current as any,
        newValues: updated as any,
        userId,
      },
    });

    return updated;
  }

  async updateWoodTypeStatus(id: string, isActive: boolean, userId: string) {
    return this.updateWoodType(id, { isActive }, userId);
  }
}
