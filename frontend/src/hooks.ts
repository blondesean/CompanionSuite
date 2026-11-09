import { useSearchParams } from 'react-router';
import { currentWeek, isWeekStart } from '../../shared/weeks';

/** Week shown on a module page, kept in the URL (?week=) so Back works. */
export function useWeekParam(): [string, (week: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('week');
  const week = isWeekStart(raw) ? raw : currentWeek();
  return [week, (next) => setParams(next === currentWeek() ? {} : { week: next }, { replace: true })];
}
