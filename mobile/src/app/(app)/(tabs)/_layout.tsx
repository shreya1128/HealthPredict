import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors } from '@/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function tabIcon(active: IconName, inactive: IconName) {
  // eslint-disable-next-line react/display-name
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <MaterialCommunityIcons name={focused ? active : inactive} size={25} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('home-variant', 'home-variant-outline') }} />
      <Tabs.Screen name="health" options={{ title: 'Health', tabBarIcon: tabIcon('heart-pulse', 'heart-pulse') }} />
      <Tabs.Screen name="medicines" options={{ title: 'Medicines', tabBarIcon: tabIcon('pill', 'pill') }} />
      <Tabs.Screen name="track" options={{ title: 'Track', tabBarIcon: tabIcon('run-fast', 'run-fast') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('account-circle', 'account-circle-outline') }} />
    </Tabs>
  );
}
