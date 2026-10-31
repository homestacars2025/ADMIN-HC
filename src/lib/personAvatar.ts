export interface PersonPhoto {
  avatar_url?: string | null;
}

const AVATAR_DIR = `${process.env.PUBLIC_URL}/avatars`;

export const CUSTOMER_CHARACTER = `${AVATAR_DIR}/customer.webp`;
export const INVESTOR_CHARACTER = `${AVATAR_DIR}/investor.webp`;

/** The 256px export of a character, for `srcSet`. */
export function smallCharacter(character: string): string {
  return character.replace(/\.webp$/, '-256.webp');
}

/**
 * A customer's own photo if they have one, otherwise the customer character.
 * `customers` has no photo column yet, so today this is always the character.
 */
export function getCustomerAvatar(customer?: PersonPhoto | null): string {
  return customer?.avatar_url || CUSTOMER_CHARACTER;
}

/** An investor's profile photo if they have one, otherwise the investor character. */
export function getInvestorAvatar(investor?: PersonPhoto | null): string {
  return investor?.avatar_url || INVESTOR_CHARACTER;
}
