import {
  CUSTOMER_CHARACTER,
  INVESTOR_CHARACTER,
  getCustomerAvatar,
  getInvestorAvatar,
  smallCharacter,
} from './personAvatar';

describe('getCustomerAvatar', () => {
  it('prefers an uploaded photo', () => {
    expect(getCustomerAvatar({ avatar_url: 'https://x/p.jpg' })).toBe('https://x/p.jpg');
  });

  it('falls back to the character', () => {
    expect(getCustomerAvatar({ avatar_url: null })).toBe(CUSTOMER_CHARACTER);
    expect(getCustomerAvatar({ avatar_url: '' })).toBe(CUSTOMER_CHARACTER);
    expect(getCustomerAvatar(null)).toBe(CUSTOMER_CHARACTER);
  });
});

describe('getInvestorAvatar', () => {
  it('prefers an uploaded photo, then the character', () => {
    expect(getInvestorAvatar({ avatar_url: 'https://x/i.jpg' })).toBe('https://x/i.jpg');
    expect(getInvestorAvatar({})).toBe(INVESTOR_CHARACTER);
  });
});

describe('smallCharacter', () => {
  it('names the 256px export', () => {
    expect(smallCharacter('/avatars/customer.webp')).toBe('/avatars/customer-256.webp');
  });
});
