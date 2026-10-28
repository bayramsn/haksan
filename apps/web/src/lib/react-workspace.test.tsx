// @vitest-environment jsdom
import { useState, version } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Dialog from '@radix-ui/react-dialog';
import { Check } from 'lucide-react';
afterEach(cleanup);
function HoistedControls() {
  const [checked, setChecked] = useState(false);
  return <Checkbox.Root aria-label="Gerçek Radix denetimi" checked={checked} onCheckedChange={value => setChecked(value === true)}><Checkbox.Indicator><Check aria-label="Seçildi" /></Checkbox.Indicator></Checkbox.Root>;
}
it('hoisted Radix and lucide share the web renderer React instance', () => {
  expect(version).toMatch(/^18\./);
  render(<HoistedControls />);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
  expect(screen.getByLabelText('Seçildi')).toBeTruthy();
});

it('real hoisted Radix dialog portal and focus/scroll helpers use web React', () => {
  render(<Dialog.Root defaultOpen><Dialog.Portal><Dialog.Overlay /><Dialog.Content aria-describedby={undefined}><Dialog.Title>Deneme</Dialog.Title><Dialog.Close>Kapat</Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>);
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
