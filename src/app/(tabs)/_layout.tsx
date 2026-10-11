import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';

import { t } from '../../i18n';
import { useColors } from '../../theme';

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        // Hidden tabs don't re-render on every GPS fix.
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.map'),
          tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="regions"
        options={{
          title: t('tab.regions'),
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="offline"
        options={{
          title: t('tab.offline'),
          tabBarIcon: ({ color, size }) => <Ionicons name="cloud-download" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
