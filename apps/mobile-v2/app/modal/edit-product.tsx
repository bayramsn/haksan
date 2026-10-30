import { useLocalSearchParams } from 'expo-router';
import { ProductForm } from '@/src/ui/products/ProductForm';

export default function EditProductScreen() {
  const { id = '' } = useLocalSearchParams<{ id?: string }>();
  return <ProductForm id={id} />;
}
