import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RoleType } from '@prisma/client';
import { FumigationService } from './fumigation.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { CreateFumigationDto } from './dto/create-fumigation.dto';
import { QueryFumigationDto } from './dto/query-fumigation.dto';
import {
  FumigationResponseDto,
  PaginatedFumigationResponseDto,
  SignedCertificateUrlResponseDto,
} from './dto/fumigation-response.dto';

@ApiTags('M06: Fumigación OIRSA')
@ApiBearerAuth()
@Controller('fumigations')
export class FumigationController {
  constructor(
    private readonly fumigationService: FumigationService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
      },
    }),
  )
  @ApiOperation({
    summary: 'Registrar tratamiento fitosanitario y subir certificado PDF OIRSA (EP-FUM-01 / UC-FUM-01)',
    description:
      'Registra un evento fitosanitario para un lote de producción (cardinalidad 1:N). Sube el archivo PDF oficial a Supabase Storage privado y persiste el registro en PostgreSQL de manera atómica con compensación.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['dailyProductionId', 'fumigationDate', 'fumigationTime', 'certificateNumber', 'file'],
      properties: {
        dailyProductionId: { type: 'string', format: 'uuid', description: 'UUID del lote de producción' },
        fumigationDate: { type: 'string', format: 'date', description: 'Fecha de fumigación (YYYY-MM-DD)' },
        fumigationTime: { type: 'string', description: 'Hora de fumigación (HH:mm o HH:mm:ss)' },
        certificateNumber: { type: 'string', description: 'Número oficial de certificado OIRSA' },
        file: { type: 'string', format: 'binary', description: 'Archivo binario PDF (máximo 10 MB)' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Tratamiento fitosanitario registrado y certificado almacenado de forma privada',
    type: FumigationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Archivo no es PDF, excede 10 MB, fecha futura o datos inválidos',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado (Rol CONSULTA no autorizado)',
  })
  @ApiResponse({
    status: 404,
    description: 'Lote de producción diaria no encontrado',
  })
  async create(
    @Body() dto: CreateFumigationDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException(
        'El archivo PDF del certificado OIRSA es obligatorio (campo "file")',
      );
    }
    return this.fumigationService.create(dto, file, user);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Listar tratamientos fitosanitarios (EP-FUM-02)',
    description:
      'Consulta paginada y filtrada de registros de fumigación por lote, rango de fechas o número de certificado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de eventos de fumigación',
    type: PaginatedFumigationResponseDto,
  })
  async findAll(@Query() query: QueryFumigationDto) {
    return this.fumigationService.findAll(query);
  }

  @Get(':id/certificate-url')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Obtener Signed URL temporal para descarga segura de certificado OIRSA (EP-FUM-03 / UC-FUM-02)',
    description:
      'Genera una URL firmada con vigencia estricta de 15 minutos (900 segundos) para descarga del archivo PDF sin exponer el bucket privado.',
  })
  @ApiParam({ name: 'id', description: 'UUID del registro de fumigación' })
  @ApiResponse({
    status: 200,
    description: 'URL firmada generada exitosamente (900s de vigencia)',
    type: SignedCertificateUrlResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Registro de fumigación no encontrado',
  })
  async getCertificateSignedUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.fumigationService.getCertificateSignedUrl(id);
  }

  @Get('download-file')
  @ApiOperation({
    summary: 'Descarga de archivo con URL firmada en modo local (desarrollo/pruebas)',
    description: 'Valida la firma HMAC y expiración de 15 minutos sin requerir Bearer token para visualización en navegador.',
  })
  async downloadLocalFile(
    @Query('path') filePath: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    if (!filePath || !expires || !sig) {
      throw new BadRequestException('Parámetros de URL firmada incompletos');
    }

    const buffer = await this.storageService.verifyAndReadLocalFile(
      decodeURIComponent(filePath),
      parseInt(expires, 10),
      sig,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="certificado-oirsa.pdf"');
    res.send(buffer);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleType.ADMIN, RoleType.CONTABILIDAD, RoleType.CONSULTA)
  @ApiOperation({
    summary: 'Obtener detalle de un tratamiento fitosanitario',
    description: 'Devuelve la información completa del tratamiento y metadatos del certificado.',
  })
  @ApiParam({ name: 'id', description: 'UUID del registro de fumigación' })
  @ApiResponse({
    status: 200,
    description: 'Detalle del tratamiento fitosanitario',
    type: FumigationResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Registro de fumigación no encontrado',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.fumigationService.findOne(id);
  }
}
