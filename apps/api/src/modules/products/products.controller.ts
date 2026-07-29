import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  productCreateSchema,
  productUpdateSchema,
  productSpecCreateSchema,
  productEquipmentCreateSchema,
  productDetailsReplaceSchema,
  brandCreateSchema,
  priceListCreateSchema,
  priceListItemCreateSchema,
  priceListItemUpdateSchema,
  priceListUpdateSchema,
  productImportCommitRequestSchema,
  productImportPreviewRequestSchema,
  productOptionSetCreateSchema,
  productOptionValueCreateSchema,
  paginationSchema,
  type ProductCreateInput,
  type ProductUpdateInput,
  type ProductSpecCreateInput,
  type ProductEquipmentCreateInput,
  type ProductDetailsReplaceInput,
  type BrandCreateInput,
  type PriceListCreateInput,
  type PriceListItemCreateInput,
  type PriceListItemUpdateInput,
  type PriceListUpdateInput,
  type ProductImportCommitRequest,
  type ProductImportPreviewRequest,
  type ProductOptionSetCreateInput,
  type ProductOptionValueCreateInput,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ProductsService } from './products.service';
import { ProductMediaService } from './product-media.service';
import { rowsToXlsxBuffer, sendXlsx } from '../../shared/utils/excel-export';

const listQuery = z.object({
  search: z.string().optional(),
  brandId: z.string().optional(),
  categoryCode: z.string().optional(),
});

const brandListQuery = z.object({
  divisionId: z.string().uuid().optional(),
});

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class ProductsController {
  constructor(
    private readonly svc: ProductsService,
    private readonly media: ProductMediaService
  ) {}

  @RequirePermissions('brands.read')
  @Get('brands')
  listBrands(
    @Query(new ZodValidationPipe(brandListQuery)) query: z.infer<typeof brandListQuery>,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.listBrands(user, { divisionScoped: true, divisionId: query.divisionId });
  }

  @RequirePermissions('brands.create')
  @Post('brands')
  createBrand(@Body(new ZodValidationPipe(brandCreateSchema)) body: BrandCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createBrand(body, user);
  }

  @RequirePermissions('products.read')
  @Get('products')
  list(
    @Query(new ZodValidationPipe(listQuery.merge(paginationSchema)))
    qp: z.infer<typeof listQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('products.read')
  @Get('product-spec-templates')
  listSpecTemplates(@CurrentUser() user: AuthContext, @Query('productTypeCode') productTypeCode?: string) {
    return this.svc.listSpecTemplates(productTypeCode, user);
  }

  @RequirePermissions('products.read')
  @Get('products/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
  }

  @RequirePermissions('products.read')
  @Get('products/:id/media')
  async listMedia(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    await this.svc.get(id, user);
    return this.media.listForProduct(id, user.tenantId);
  }

  @RequirePermissions('products.create')
  @Post('products')
  create(
    @Body(new ZodValidationPipe(productCreateSchema)) body: ProductCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.create(body, user);
  }

  @RequirePermissions('products.create')
  @Post('products/import/preview')
  previewImport(
    @Body(new ZodValidationPipe(productImportPreviewRequestSchema)) body: ProductImportPreviewRequest,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.previewImport(body, user);
  }

  @RequirePermissions('products.create')
  @Post('products/import/commit')
  commitImport(
    @Body(new ZodValidationPipe(productImportCommitRequestSchema)) body: ProductImportCommitRequest,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.commitImport(body, user);
  }

  @RequirePermissions('products.create')
  @Get('products/import/template')
  async importTemplate(@Res({ passthrough: true }) reply: FastifyReply) {
    const rows = [
      {
        Marka: 'Ecoca',
        Seri: 'MT',
        Model: 'MT-208/500',
        'Ürün Adı': 'Ecoca MT-208/500 CNC Torna Tezgahı',
        'Ürün Tipi': 'CNC Torna Tezgahı',
        'Para Birimi': 'USD',
        'Liste Fiyatı': 68300,
        KDV: 20,
        Menşei: 'Tayvan',
        GTIP: '845811',
        'Stok Kodu': 'ECOCA-MT208',
        Açıklama: '8 inç aynalı CNC torna',
        'Kontrol Ünitesi': 'FANUC 0i-TF Plus',
        'Standart Donanım': 'Hidrolik 10 İstasyon Taret; Talaş konveyörü',
        'Opsiyonel Donanım': 'Takım ölçme kolu; Çubuk sürücü',
        'Ayna Ölçüsü': '8"',
        'Fener Mili Devri': '4800 dv/dk',
      },
    ];
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Ürünler'), 'urun-import-sablonu.xlsx');
  }

  @RequirePermissions('products.update')
  @Patch('products/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productUpdateSchema)) body: ProductUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.update(id, body, user);
  }

  @RequirePermissions('products.delete')
  @Delete('products/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }

  @RequirePermissions('product_specs.read')
  @Get('products/:id/specs')
  specs(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.listSpecs(id, user);
  }

  @RequirePermissions('product_specs.create')
  @Post('products/:id/specs')
  addSpec(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productSpecCreateSchema)) body: ProductSpecCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.addSpec(id, body, user);
  }

  @RequirePermissions('products.read')
  @Get('products/:id/equipment')
  equipment(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.listEquipment(id, user);
  }

  @RequirePermissions('products.read')
  @Get('products/:id/compatible-optional-equipment')
  compatibleOptionalEquipment(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.listCompatibleOptionalEquipment(id, user);
  }

  @RequirePermissions('products.update')
  @Post('products/:id/equipment')
  addEquipment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productEquipmentCreateSchema)) body: ProductEquipmentCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.addEquipment(id, body, user);
  }

  @RequirePermissions('products.update')
  @Put('products/:id/details')
  replaceDetails(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productDetailsReplaceSchema)) body: ProductDetailsReplaceInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.replaceDetails(id, body, user);
  }

  @RequirePermissions('products.read')
  @Get('products/:id/options')
  listOptions(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.listOptionSets(id, user);
  }

  @RequirePermissions('products.update')
  @Post('products/:id/options')
  addOptionSet(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productOptionSetCreateSchema)) body: ProductOptionSetCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.addOptionSet(id, body, user);
  }

  @RequirePermissions('products.update')
  @Post('products/options/:setId/values')
  addOptionValue(
    @Param('setId') setId: string,
    @Body(new ZodValidationPipe(productOptionValueCreateSchema)) body: ProductOptionValueCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.addOptionValue(setId, body, user);
  }

  @RequirePermissions('price_lists.read')
  @Get('price-lists')
  listPriceLists(@Query(new ZodValidationPipe(paginationSchema)) qp: Pagination, @CurrentUser() user: AuthContext) {
    return this.svc.listPriceLists(user, qp);
  }

  @RequirePermissions('price_lists.create')
  @Post('price-lists')
  createPriceList(@Body(new ZodValidationPipe(priceListCreateSchema)) body: PriceListCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createPriceList(body, user);
  }

  @RequirePermissions('price_lists.update')
  @Patch('price-lists/:id')
  updatePriceList(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(priceListUpdateSchema)) body: PriceListUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updatePriceList(id, body, user);
  }

  @RequirePermissions('price_lists.read')
  @Get('price-lists/:id/items')
  listPriceListItems(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.listPriceListItems(id, user);
  }

  @RequirePermissions('price_lists.create')
  @Post('price-lists/:id/items')
  createPriceListItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(priceListItemCreateSchema)) body: PriceListItemCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createPriceListItem(id, body, user);
  }

  @RequirePermissions('price_lists.update')
  @Patch('price-lists/:id/items/:itemId')
  updatePriceListItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(priceListItemUpdateSchema)) body: PriceListItemUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updatePriceListItem(id, itemId, body, user);
  }
}
