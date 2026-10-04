// 料金設定（円・税込）。将来は管理画面から変更できるよう設定テーブルに移す想定。
export const PRICING = {
  wrappingFee: 330,
  shippingFee: 880,
  freeShippingThreshold: 5500,
};

/** 小計とオプションから注文金額を計算する。 */
export function calculateTotals(subtotal, { giftWrapping }, pricing = PRICING) {
  const wrappingFee = giftWrapping ? pricing.wrappingFee : 0;
  const shippingFee = subtotal >= pricing.freeShippingThreshold ? 0 : pricing.shippingFee;
  return { subtotal, wrappingFee, shippingFee, total: subtotal + wrappingFee + shippingFee };
}
