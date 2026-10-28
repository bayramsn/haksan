import { usePathname, useRouter, type Href } from 'expo-router';
import { isTabRootPath, parentPath } from './hierarchy';

/** Soğuk başlangıçta geri geçmişi yoksa ekranın güvenli üst seviyesini açar. */
export function useHierarchyBack() {
  const router = useRouter();
  const pathname = usePathname();
  return {
    isTabRoot: isTabRootPath(pathname),
    goBack: () => {
      if (router.canGoBack()) router.back();
      else router.replace(parentPath(pathname) as unknown as Href);
    },
  };
}
