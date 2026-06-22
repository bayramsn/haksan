import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { stackScreenOptions } from '../../navigation/options';
import { CompaniesListScreen } from './CompaniesListScreen';
import { CompanyDetailScreen } from './CompanyDetailScreen';
import { CompanyFormScreen } from './CompanyFormScreen';

const Stack = createNativeStackNavigator();

export function CompaniesNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="CompaniesList" component={CompaniesListScreen} options={{ title: 'Firmalar' }} />
      <Stack.Screen
        name="CompanyDetail"
        component={CompanyDetailScreen}
        options={({ route }: any) => ({ title: route.params?.title ?? 'Firma' })}
      />
      <Stack.Screen name="CompanyForm" component={CompanyFormScreen} options={{ title: 'Firma' }} />
    </Stack.Navigator>
  );
}
