import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { initApi } from './api';
import type { AuthClient, User } from './auth';
import { ChoreHistory } from './pages/chores/ChoreHistory';
import { ChoreManage } from './pages/chores/ChoreManage';
import { ChoresLayout, ChoreWeekView } from './pages/chores/Chores';
import { FunDone, FunIdeas, FunLayout } from './pages/fun/Fun';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { GroceryList } from './pages/meals/GroceryList';
import { MealsLayout, MealWeekView } from './pages/meals/Meals';
import { RecipeEditor } from './pages/meals/RecipeEditor';
import { RecipeList } from './pages/meals/Recipes';
import { Settings } from './pages/Settings';
import { TodoHistory } from './pages/todo/TodoHistory';
import { TodoLayout, TodoList } from './pages/todo/Todo';

interface Session {
  auth: AuthClient;
  user: User;
  signOut(): void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside of a signed-in screen');
  return session;
}

export function App({ auth }: { auth: AuthClient }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(() => auth.currentUser());

  const signOut = useCallback(() => {
    auth.signOut();
    queryClient.clear();
    setUser(null);
  }, [auth, queryClient]);

  // Set during render (it's idempotent) so the first queries already have auth.
  initApi(auth, signOut);

  const session = useMemo(() => (user ? { auth, user, signOut } : null), [auth, user, signOut]);

  if (!session) return <Login auth={auth} onSignedIn={() => setUser(auth.currentUser())} />;

  return (
    <SessionContext.Provider value={session}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />

        <Route path="/chores" element={<ChoresLayout />}>
          <Route index element={<ChoreWeekView />} />
          <Route path="manage" element={<ChoreManage />} />
          <Route path="history" element={<ChoreHistory />} />
        </Route>

        <Route path="/meals" element={<MealsLayout />}>
          <Route index element={<MealWeekView />} />
          <Route path="recipes" element={<RecipeList />} />
        </Route>
        <Route path="/meals/recipes/:id" element={<RecipeEditor />} />
        <Route path="/meals/grocery/:week" element={<GroceryList />} />

        <Route path="/todo" element={<TodoLayout />}>
          <Route index element={<TodoList />} />
          <Route path="history" element={<TodoHistory />} />
        </Route>

        <Route path="/fun" element={<FunLayout />}>
          <Route index element={<FunIdeas />} />
          <Route path="done" element={<FunDone />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionContext.Provider>
  );
}
