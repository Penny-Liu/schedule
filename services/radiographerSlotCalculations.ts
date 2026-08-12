export const calculateBmdSlots = (orderCount: number): number =>
  Math.round(Math.max(0, Number(orderCount) || 0));
