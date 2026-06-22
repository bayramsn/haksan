import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { stackScreenOptions } from '../../navigation/options';
import { ContactsListScreen } from './ContactsListScreen';
import { ContactDetailScreen } from './ContactDetailScreen';
import { ContactFormScreen } from './ContactFormScreen';

const Stack = createNativeStackNavigator();

export function ContactsNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="ContactsList" component={ContactsListScreen} options={{ title: 'Kontaklar' }} />
      <Stack.Screen
        name="ContactDetail"
        component={ContactDetailScreen}
        options={({ route }: any) => ({ title: route.params?.title ?? 'Kontak' })}
      />
      <Stack.Screen name="ContactForm" component={ContactFormScreen} options={{ title: 'Kontak' }} />
    </Stack.Navigator>
  );
}
