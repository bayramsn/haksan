import {
  QUALIFICATION_STAGE_PIPELINE_STEPS,
  type PipelineStageCode,
  type QualificationStageCode,
} from "@haksan/shared";

/**
 * Fırsat içindeki operasyon kartlarının satış alanı grupları.
 *
 * Bu eşleme ortak süreç kaynağını doğrudan kullanır. Böylece C alanının giriş
 * operasyonu olan `sales` C'de, kapanış operasyonu olan `delivered` WIN'de
 * kalır ve arayüz backend geçiş kurallarıyla aynı alan sahipliğini gösterir.
 */
export const OPPORTUNITY_OPERATION_GROUP_STEPS: Readonly<
  Record<QualificationStageCode, readonly PipelineStageCode[]>
> = QUALIFICATION_STAGE_PIPELINE_STEPS;

export function operationGroupForStage(
  operationStage: PipelineStageCode,
): QualificationStageCode | null {
  return (
    (Object.keys(OPPORTUNITY_OPERATION_GROUP_STEPS) as QualificationStageCode[]).find((group) =>
      OPPORTUNITY_OPERATION_GROUP_STEPS[group].includes(operationStage),
    ) ?? null
  );
}
