export const CATEGORIES = ['Economy', 'Middle', 'Luxury', 'SUV', 'Van', 'Electric'] as const;
export type Category = typeof CATEGORIES[number];
