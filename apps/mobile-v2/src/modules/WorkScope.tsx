import { createContext, useContext } from 'react';
/** Null in module routes; Work explicitly chooses personal or workspace scope. */
export const WorkScopeContext = createContext<{ assignedUserId?: string } | null>(null);
export const useWorkScope = () => useContext(WorkScopeContext);
