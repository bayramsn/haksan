import { cloneElement, isValidElement, useEffect, useRef, useState, type ComponentProps, type ComponentType, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';

/** Keep closed form trees and their catalogs out of the initial application load. */
export function deferDialog<P extends { trigger: ReactNode }>(load: () => Promise<ComponentType<P & { defaultOpen?: boolean }>>) {
  return function DeferredDialog(props: P) {
    const [Component, setComponent] = useState<ComponentType<P & { defaultOpen?: boolean }> | null>(null);
    const [loading, setLoading] = useState(false);
    const pending = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    if (Component) return <Component {...props} defaultOpen />;
    if (!isValidElement(props.trigger)) return props.trigger;
    const trigger = props.trigger as ReactElement<{ onClick?: (event: MouseEvent) => void; disabled?: boolean; 'aria-busy'?: boolean }>;
    return cloneElement(trigger, {
      disabled: trigger.props.disabled || loading,
      'aria-busy': loading,
      onClick: (event: MouseEvent) => {
        trigger.props.onClick?.(event);
        if (event.defaultPrevented || pending.current) return;
        pending.current = true;
        setLoading(true);
        void load().then((loaded) => { if (mounted.current) setComponent(() => loaded); }).catch(() => {
          if (mounted.current) toast.error('Form yüklenemedi. Yeniden deneyin.');
        }).finally(() => {
          pending.current = false;
          if (mounted.current) setLoading(false);
        });
      },
    });
  };
}

type Forms = typeof import('./CreateDialogs');
export const CreateCustomerDialog = deferDialog<ComponentProps<Forms['CreateCustomerDialog']>>(() => import('./CreateDialogs').then(module => module.CreateCustomerDialog));
export const CreateContactDialog = deferDialog<ComponentProps<Forms['CreateContactDialog']>>(() => import('./CreateDialogs').then(module => module.CreateContactDialog));
export const CreateCaseDialog = deferDialog<ComponentProps<Forms['CreateCaseDialog']>>(() => import('./CreateDialogs').then(module => module.CreateCaseDialog));
export const CreateServiceRequestDialog = deferDialog<ComponentProps<Forms['CreateServiceRequestDialog']>>(() => import('./CreateDialogs').then(module => module.CreateServiceRequestDialog));
export const QuickCreateDialog = deferDialog<ComponentProps<Forms['QuickCreateDialog']>>(() => import('./CreateDialogs').then(module => module.QuickCreateDialog));
