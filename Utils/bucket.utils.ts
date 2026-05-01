import mongoose from "mongoose";

export const asObjectId = (value: string) => new mongoose.Types.ObjectId(value);

export const recalculateBucket = (bucketCollections: any[]) => {
  const totalBucketMedicines = bucketCollections.reduce(
    (total, store) => total + (store.medicines?.length || 0),
    0,
  );

  const totalBucketQuantity = bucketCollections.reduce(
    (total, store) =>
      total +
      (store.medicines || []).reduce((storeTotal: number, medicine: any) => storeTotal + (medicine.quantity || 1), 0),
    0,
  );

  const bucketGrandTotal = bucketCollections.reduce((total, store) => {
    const storeSubtotal = (store.medicines || []).reduce((storeTotal: number, medicine: any) => {
      const price = Number(medicine.discountedPrice ?? medicine.price ?? 0);
      const quantity = Number(medicine.quantity ?? 1);
      return storeTotal + price * quantity;
    }, 0);
    return total + storeSubtotal + Number(store.deliveryCharges || 0) - Number(store.storeDiscount || 0);
  }, 0);

  return {
    totalBucketMedicines,
    totalBucketQuantity,
    bucketGrandTotal,
  };
};
