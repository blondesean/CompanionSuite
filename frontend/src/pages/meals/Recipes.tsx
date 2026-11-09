import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api';
import { Empty, ErrorNote, Loading } from '../../components/ui';

export function RecipeList() {
  const query = useQuery({ queryKey: ['recipes'], queryFn: api.recipes });
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const recipes = (query.data ?? []).filter(
    (r) => !term || r.name.toLowerCase().includes(term) || r.ingredients.some((i) => i.name.toLowerCase().includes(term)),
  );

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search recipes or ingredients"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Link to="/meals/recipes/new" className="btn btn-primary">
          + New
        </Link>
      </div>
      {query.isLoading && <Loading />}
      {query.error && <ErrorNote error={query.error} onRetry={() => query.refetch()} />}
      {query.data?.length === 0 && (
        <Empty icon="📖" title="No recipes yet">
          <p>Add a recipe with its ingredients and amounts.</p>
        </Empty>
      )}
      {query.data && query.data.length > 0 && recipes.length === 0 && <p className="hint center">No matches.</p>}
      <ul className="list">
        {recipes.map((r) => (
          <li key={r.id}>
            <Link to={`/meals/recipes/${r.id}`} className="row-item row-button">
              <div className="row-main">
                <span className="row-title">{r.name}</span>
                <span className="row-meta">
                  {r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'}
                </span>
              </div>
              <span className="chevron" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
