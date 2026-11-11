import { Params } from '@angular/router';

/** Old email links must open the rating modal, never the conversation widget. */
export function legacyRatingPath(params: Params): string | null {
  const id = params['supportChat'];
  const stars = params['supportRating'];
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) ||
      typeof stars !== 'string' || !/^[1-5]$/.test(stars)) return null;
  return `/rate-support/${id}?stars=${stars}`;
}
