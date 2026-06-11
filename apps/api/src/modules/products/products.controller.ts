import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
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
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ProductsService } from './products.service';
import { ProductMediaService } from './product-media.service';

const listQuery = z.object({
  search: z.string().optional(),
  brandId: z.string().optional(),
  categoryCode: z.string().optional(),
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
  listBrands(@CurrentUser() user: AuthContext) {
    return this.svc.listBrands(user);
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
  @Get('products/:id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
  }

  @RequirePermissions('products.read')
  @Get('products/:id/media')
  async listMedia(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    await this.media.assertProductExists(id, user.tenantId);
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
    @Body() body: any,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.addOptionSet(id, body, user);
  }

  @RequirePermissions('products.update')
  @Post('products/options/:setId/values')
  addOptionValue(
    @Param('setId') setId: string,
    @Body() body: any,
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
