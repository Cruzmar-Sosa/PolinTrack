import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  NotEquals,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentType, ReasonType } from '@prisma/client';

@ValidatorConstraint({ name: 'isReasonNotesValidForReasonType', async: false })
export class IsReasonNotesValidForReasonTypeConstraint
  implements ValidatorConstraintInterface
{
  validate(notes: string | undefined, args: ValidationArguments) {
    const obj = args.object as any;
    if (obj.reasonType === ReasonType.CUSTOM) {
      return typeof notes === 'string' && notes.trim().length >= 10;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments) {
    const obj = args.object as any;
    if (obj.reasonType === ReasonType.CUSTOM) {
      return 'Debe proporcionar una justificación detallada (mínimo 10 caracteres) para el ajuste personalizado (FA-03).';
    }
    return 'Notas de motivo inválidas.';
  }
}

export class CreateInventoryAdjustmentDto {
  @ApiProperty({
    description: 'UUID del producto terminado a rectificar (uno de los 5 polines normalizados)',
    example: 'p1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'El productId es obligatorio' })
  @IsUUID('4', { message: 'El productId debe ser un UUID v4 válido' })
  productId: string;

  @ApiPropertyOptional({
    description: 'Dirección del ajuste (INCREMENT o DECREMENT). Si se omite, se deduce del signo de quantity.',
    enum: AdjustmentType,
    example: AdjustmentType.INCREMENT,
  })
  @IsOptional()
  @IsEnum(AdjustmentType, {
    message: 'adjustmentType debe ser INCREMENT o DECREMENT',
  })
  adjustmentType?: AdjustmentType;

  @ApiProperty({
    description: 'Cantidad de piezas a ajustar (entero relativo no nulo, puede ser positivo o negativo)',
    example: 50,
  })
  @IsNotEmpty({ message: 'La cantidad es obligatoria' })
  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @NotEquals(0, { message: 'La cantidad a ajustar no puede ser cero' })
  quantity: number;

  @ApiProperty({
    description: 'Tipificación del motivo de rectificación (ERROR_INGRESO o CUSTOM)',
    enum: ReasonType,
    example: ReasonType.ERROR_INGRESO,
  })
  @IsNotEmpty({ message: 'El reasonType es obligatorio' })
  @IsEnum(ReasonType, {
    message: 'reasonType debe ser ERROR_INGRESO o CUSTOM',
  })
  reasonType: ReasonType;

  @ApiPropertyOptional({
    description:
      'Explicación detallada de la discrepancia física detectada. Obligatorio (mínimo 10 caracteres) si reasonType es CUSTOM (FA-03).',
    example: 'Conteo físico en patio detectó 50 piezas adicionales no reportadas',
  })
  @IsOptional()
  @IsString({ message: 'reasonNotes debe ser una cadena de texto' })
  @Validate(IsReasonNotesValidForReasonTypeConstraint)
  reasonNotes?: string;
}
