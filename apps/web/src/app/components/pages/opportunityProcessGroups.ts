import {
  QUALIFICATION_STAGE_PIPELINE_STEPS,
  type PipelineStageCode,
  type QualificationStageCode,
} from "@haksan/shared";

/**
 * Fırsat içindeki operasyon kartlarının sunum grupları.
 *
 * `sales`, backend akışında lead dönüşümünden sonra kullanılan eski giriş
 * aşamasıdır ve teknik olarak C ile bağlı kalmalıdır. Kullanıcı açısından ise
 * "Satış" kapanış sonucudur; bu nedenle yalnız arayüzde C'den çıkarılıp WIN
 * grubunda gösterilir. Böylece görünüm düzelirken geçiş kuralları ve geçmiş
 * kayıtlar değişmez.
 */
export const OPPORTUNITY_OPERATION_GROUP_STEPS: Readonly<
  Record<QualificationStageCode, readonly PipelineStageCode[]>
> = {
  ...QUALIFICATION_STAGE_PIPELINE_STEPS,
  c: QUALIFICATION_STAGE_PIPELINE_STEPS.c.filter((step) => step !== "sales"),
  win: [
    "sales",
    ...QUALIFICATION_STAGE_PIPELINE_STEPS.win.filter((step) => step !== "sales"),
  ],
};
