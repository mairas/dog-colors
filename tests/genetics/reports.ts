import { parseReport } from '../../src/report/parse.ts';
import type { Report } from '../../src/report/types.ts';
import { fixtureText } from '../report/fixtures.ts';

export { syntheticReport } from './synthetic.ts';

export async function sampleReport(letter: string): Promise<Report> {
  const result = await parseReport(fixtureText(letter));
  if (!result.ok) {
    throw new Error(`fixture ${letter} was rejected as ${result.kind}`);
  }
  return result.report;
}
