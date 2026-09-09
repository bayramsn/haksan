// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LASER_MODELS, resolveLaserProfile } from '@haksan/shared';
import { ProductSpecTemplatesCard } from './ProductSpecTemplatesCard';
import { adminService } from '../../../../lib/services';
import { laserProfilesService } from '../../../../lib/services/laser-profiles.service';
vi.mock('../../../lib/store', () => ({useStore:()=>({products:[]})}));
vi.mock('../../../../lib/auth', () => ({useAuth:()=>({activeDivision:'cnc',user:{id:'u',tenantId:'t',divisions:[{id:'cnc',code:'CNC',name:'CNC'},{id:'sac',code:'SAC_ISLEME',name:'Sac İşleme'},{id:'universal',code:'UNIVERSAL',name:'Üniversal'}]}})}));
vi.mock('../../../../lib/services', () => ({adminService:{lookupRows:vi.fn(async()=>[]),productSpecTemplates:vi.fn(async()=>[]),batchSaveProductSpecTemplates:vi.fn(async()=>({rows:[]}))},productService:{listBrands:vi.fn(async()=>[{id:'hex',name:'HEXLASER',technicalCatalogCode:'AORE_LASER'}])}}));
vi.mock('../../../../lib/services/laser-profiles.service',()=>({laserProfilesService:{options:vi.fn(),resolve:vi.fn(),save:vi.fn()}}));
vi.mock('../../dialogs/TechnicalImportDialog',()=>({TechnicalImportDialog:()=>null}));
vi.mock('./LaserProfilesPanel',()=>({LaserProfileImportDialog:({open}:any)=>open?<div role="dialog">Lazer model profili aktarımı</div>:null}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock('lucide-react',async(importOriginal)=>{const actual=await importOriginal<Record<string,unknown>>();return {...actual,...Object.fromEntries(Object.keys(actual).filter((key)=>/^[A-Z]/.test(key)).map((key)=>[key,()=>null]))};});
vi.mock('../../ui/label',()=>({Label:({children,...props}:any)=><label {...props}>{children}</label>}));
vi.mock('../../ui/switch',()=>({Switch:({checked,onCheckedChange}:any)=><input type="checkbox" checked={checked} onChange={(event)=>onCheckedChange(event.target.checked)}/>}));
vi.mock('../../ui/dialog',()=>({Dialog:({open,children}:any)=>open?<>{children}</>:null,DialogContent:({children}:any)=><div>{children}</div>,DialogHeader:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h2>{children}</h2>,DialogDescription:({children}:any)=><p>{children}</p>,DialogFooter:({children}:any)=><div>{children}</div>}));
vi.mock('../../ui/sheet',()=>({Sheet:()=>null,SheetContent:()=>null,SheetHeader:()=>null,SheetTitle:()=>null,SheetDescription:()=>null}));
vi.mock('../../ui/alert-dialog',()=>({AlertDialog:({open,children}:any)=>open?<>{children}</>:null,AlertDialogContent:({children}:any)=><div>{children}</div>,AlertDialogHeader:({children}:any)=><div>{children}</div>,AlertDialogTitle:({children}:any)=><h2>{children}</h2>,AlertDialogDescription:({children}:any)=><p>{children}</p>,AlertDialogFooter:({children}:any)=><div>{children}</div>,AlertDialogAction:({children,onClick}:any)=><button onClick={onClick}>{children}</button>,AlertDialogCancel:({children}:any)=><button>{children}</button>}));
beforeEach(()=>{
  vi.clearAllMocks();const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  vi.mocked(laserProfilesService.options).mockResolvedValue({models:[...LASER_MODELS],powerOptions:[1.5,2,3,6,12,20,30],cabinOptions:['open','closed']});
  vi.mocked(laserProfilesService.resolve).mockImplementation(async(_scope,selection)=>resolveLaserProfile(selection));
  vi.mocked(laserProfilesService.save).mockImplementation(async(_scope,selection,specs)=>({...resolveLaserProfile(selection),profileId:'saved',specs,syncedProductCount:1}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function openSheet(){
  await waitFor(()=>expect(screen.getByRole('button',{name:/Seçili taslağı aç|Seçili şablonu aç|Lazer kombinasyonlarını aç/})).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button',{name:/Seçili taslağı aç|Seçili şablonu aç|Lazer kombinasyonlarını aç/}));
}
async function selectModel(power='6'){
  await waitFor(()=>expect(screen.getByLabelText('3. Ürün serisi tipi')).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('3. Ürün serisi tipi'),{target:{value:'F'}});
  fireEvent.change(screen.getByLabelText('4. Kabin tipi'),{target:{value:'open'}});
  fireEvent.change(screen.getByLabelText('5. Rezonatör gücü'),{target:{value:power}});
  fireEvent.change(screen.getByLabelText('6. Tabla ölçüsü'),{target:{value:'F3015'}});
}
describe('shared technical settings workbook',()=>{
  it('edits the exact laser profile, preserves combination drafts, and uses profile save',async()=>{
    render(<ProductSpecTemplatesCard divisionId="sac"/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Seçili taslağı aç'})).not.toBeDisabled());
    fireEvent.change(await screen.findByLabelText(/Ürün Alt Kategorisi/),{target:{value:'SAC_KESME'}});
    await screen.findByRole('option',{name:'Fiber Lazer Kesim'});
    fireEvent.change(screen.getByLabelText(/Ürün Tipi/),{target:{value:'FIBER_LAZER_KESIM'}});
    await openSheet();await selectModel();
    const weight=await screen.findByLabelText('Makine Ağırlığı seçili makine değeri');expect(weight).toHaveValue('2150');
    expect(screen.getByText('Seçili Makine Değeri')).toBeInTheDocument();
    expect(screen.getByText(/Kaydettiğiniz alanlar eşleşen ürün kartlarına uygulanır/)).toBeInTheDocument();
    expect(screen.queryByText('Opsiyonel değerler')).not.toBeInTheDocument();
    expect(screen.queryByText('Lazer teknik profilleri')).not.toBeInTheDocument();
    fireEvent.change(weight,{target:{value:'2222'}});
    fireEvent.change(screen.getByLabelText('5. Rezonatör gücü'),{target:{value:'12'}});
    expect(screen.queryByLabelText('Makine Ağırlığı seçili makine değeri')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('6. Tabla ölçüsü'),{target:{value:'F3015'}});
    await waitFor(()=>expect(screen.getByLabelText('Makine Ağırlığı seçili makine değeri')).toHaveValue('3150'));
    fireEvent.change(screen.getByLabelText('5. Rezonatör gücü'),{target:{value:'6'}});
    fireEvent.change(screen.getByLabelText('6. Tabla ölçüsü'),{target:{value:'F3015'}});
    await waitFor(()=>expect(screen.getByLabelText('Makine Ağırlığı seçili makine değeri')).toHaveValue('2222'));
    fireEvent.click(screen.getByRole('button',{name:'Değişiklikleri kaydet'}));
    await waitFor(()=>expect(laserProfilesService.save).toHaveBeenCalledTimes(1));
    expect(vi.mocked(laserProfilesService.save).mock.calls[0][0]).toEqual({divisionId:'sac',brandId:'hex'});
    expect(vi.mocked(laserProfilesService.save).mock.calls[0][2]).toEqual(expect.arrayContaining([expect.objectContaining({key:'Makine Ağırlığı',value:'2222',sourceValue:'2150',isManual:true})]));
    expect(adminService.batchSaveProductSpecTemplates).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Model profillerini yükle'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Lazer model profili aktarımı');
  });
  it.each(['cnc','universal'])('keeps %s templates on the existing generic save endpoint',async(divisionId)=>{
    render(<ProductSpecTemplatesCard divisionId={divisionId}/>);await openSheet();
    expect(screen.queryByLabelText('3. Ürün serisi tipi')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Değişiklikleri kaydet'}));
    await waitFor(()=>expect(adminService.batchSaveProductSpecTemplates).toHaveBeenCalled());
    expect(vi.mocked(adminService.batchSaveProductSpecTemplates).mock.calls[0][0]).toMatchObject({divisionId,pruneMissing:true});
    expect(laserProfilesService.save).not.toHaveBeenCalled();
  });
});
