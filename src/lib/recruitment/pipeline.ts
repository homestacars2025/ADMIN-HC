/**
 * The pipeline's tiles and search, as in Team's HrOpeningPage (d38b6dc), so a filter
 * shows the same applicants in both apps.
 */

import type { Applicant, Interview, Opening } from './hr';
import { weightedScore } from './model';

export const TILE_FILTERS = ['new', 'shortlisted', 'interviewed', 'hired', 'auto_rejected'] as const;
export type TileFilter = typeof TILE_FILTERS[number];

export const matchesTile = (a: Applicant, filter: TileFilter | 'all') =>
  filter === 'all' || (filter === 'shortlisted' ? a.shortlisted : filter === 'auto_rejected' ? a.knockoutFailed : a.stage === filter);

export const matchesSearch = (a: Applicant, query: string) => {
  const words = query.trim().toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [a.fullName, a.nationality, a.residenceDistrict, a.residenceCity, a.phone, a.email].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
  return words.every((w) => hay.includes(w));
};

export function tileCounts(list: Applicant[]): Record<TileFilter | 'all', number> {
  return {
    all: list.length,
    new: list.filter((a) => a.stage === 'new').length,
    shortlisted: list.filter((a) => a.shortlisted).length,
    interviewed: list.filter((a) => a.stage === 'interviewed').length,
    hired: list.filter((a) => a.stage === 'hired').length,
    auto_rejected: list.filter((a) => a.knockoutFailed).length,
  };
}

/** Each applicant's best interview score out of 100. */
export function bestScores(opening: Opening | null, interviews: Interview[]): Map<string, number> {
  const map = new Map<string, number>();
  if (!opening) return map;
  for (const interview of interviews) {
    const s = weightedScore(opening.interviewCriteria, interview.scores);
    if (s && s.total > (map.get(interview.applicantId) ?? -1)) map.set(interview.applicantId, s.total);
  }
  return map;
}

/** The scored applicants, best first: the leaderboard. */
export function leaderboard(opening: Opening, applicants: Applicant[], interviews: Interview[]) {
  return applicants
    .map((applicant) => {
      const best = interviews.filter((i) => i.applicantId === applicant.id)
        .map((i) => weightedScore(opening.interviewCriteria, i.scores))
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.total - a.total)[0];
      return best ? { applicant, score: best } : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.score.total - a.score.total);
}
