/**
 * navigation/AppNavigator.js — Root navigation for Medisync Mobile
 * Clean Medical Theme — Teal/White
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Platform, Text, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, SHADOW } from '../theme';

// Auth screens
import LoginScreen    from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

// Patient screens
import ScanScreen    from '../screens/patient/ScanScreen';
import ResultsScreen from '../screens/patient/ResultsScreen';
import PillboxScreen from '../screens/patient/PillboxScreen';
import ChatScreen    from '../screens/patient/ChatScreen';
import HistoryScreen from '../screens/patient/HistoryScreen';
import ProfileScreen from '../screens/patient/ProfileScreen';
import OnboardingScreen from '../screens/patient/OnboardingScreen';
import SymptomReportScreen from '../screens/patient/SymptomReportScreen';
import CallingSettingsScreen from '../screens/patient/CallingSettingsScreen';

// Doctor screens
import DoctorInboxScreen    from '../screens/doctor/DoctorInboxScreen';
import DoctorPatientsScreen from '../screens/doctor/DoctorPatientsScreen';
import DoctorAlertsScreen   from '../screens/doctor/DoctorAlertsScreen';
import DoctorPatientDetailScreen from '../screens/doctor/DoctorPatientDetailScreen';
import DoctorSearchScreen   from '../screens/doctor/DoctorSearchScreen';

const Stack    = createNativeStackNavigator();
const Tab      = createBottomTabNavigator();

// ─── Custom Scan Button ───────────────────────────────────────────────────────
const ScanTabButton = ({ children, onPress }) => (
  <TouchableOpacity
    style={{
      top: -18,
      justifyContent: 'center',
      alignItems: 'center',
    }}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={{
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: COLORS.brand600,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: COLORS.white,
      ...SHADOW.md,
    }}>
      {children}
    </View>
  </TouchableOpacity>
);

// ─── Patient Tab Navigator ────────────────────────────────────────────────────
function PatientTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'History') iconName = focused ? 'time' : 'time-outline';
          else if (route.name === 'Pillbox') iconName = focused ? 'medkit' : 'medkit-outline';
          else if (route.name === 'Chat') iconName = focused ? 'chatbubble' : 'chatbubble-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

          return <Ionicons name={iconName} size={22} color={color} />;
        },
        tabBarActiveTintColor: COLORS.brand600,
        tabBarInactiveTintColor: COLORS.slate400,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: Platform.OS === 'ios' ? 85 : 68,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: FONTS.semibold,
          marginTop: 2,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="History" component={HistoryScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Pillbox" component={PillboxScreen} options={{ tabBarLabel: 'Pillbox' }} />
      
      {/* Center Scan Button */}
      <Tab.Screen 
        name="Scan" 
        component={ScanScreen} 
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => <Ionicons name="scan" size={26} color={COLORS.white} />,
          tabBarButton: (props) => <ScanTabButton {...props} />,
        }} 
      />

      <Tab.Screen name="Chat" component={ChatScreen} options={{ tabBarLabel: 'Chat' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

// ─── Doctor Tab Navigator ─────────────────────────────────────────────────────

function DoctorPatientsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientsList" component={DoctorPatientsScreen} />
      <Stack.Screen name="PatientDetail" component={DoctorPatientDetailScreen} />
      <Stack.Screen name="SearchPatients" component={DoctorSearchScreen} />
    </Stack.Navigator>
  );
}

function DoctorTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'Inbox') iconName = focused ? 'mail' : 'mail-outline';
          else if (route.name === 'Alerts') iconName = focused ? 'notifications' : 'notifications-outline';
          return <Ionicons name={iconName} size={22} color={color} />;
        },
        tabBarActiveTintColor: COLORS.brand600,
        tabBarInactiveTintColor: COLORS.slate400,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: Platform.OS === 'ios' ? 85 : 68,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: FONTS.semibold,
          marginTop: 2,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Inbox" component={DoctorInboxScreen} options={{ tabBarLabel: 'Inbox' }} />
      
      {/* Center Patients Button */}
      <Tab.Screen 
        name="Patients" 
        component={DoctorPatientsStack} 
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => <Ionicons name="people" size={26} color={COLORS.white} />,
          tabBarButton: (props) => <ScanTabButton {...props} />,
        }} 
      />

      <Tab.Screen name="Alerts" component={DoctorAlertsScreen} options={{ tabBarLabel: 'Alerts' }} />
    </Tab.Navigator>
  );
}

// ─── Root Loading Screen ──────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <View style={styles.loader}>
      <View style={[styles.loaderIcon, { overflow: 'hidden' }]}>
        <Image source={require('../../assets/logo.png')} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
      </View>
      <ActivityIndicator size="large" color={COLORS.brand500} style={{ marginTop: 20 }} />
      <Text style={styles.loaderText}>Loading Medisync…</Text>
    </View>
  );
}

// ─── Patient Stack Nav ────────────────────────────────────────────────────────
function PatientStackNav() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientTabs" component={PatientTabs} />
      <Stack.Screen name="Results" component={ResultsScreen} />
      <Stack.Screen name="SymptomReport" component={SymptomReportScreen} />
      <Stack.Screen name="CallingSettings" component={CallingSettingsScreen} />
    </Stack.Navigator>
  );
}

// ─── Auth Stack ───────────────────────────────────────────────────────────────
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"    component={LoginScreen}    />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { isLoggedIn, user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      {!isLoggedIn ? (
        <AuthStack />
      ) : user?.role === 'doctor' ? (
        <DoctorTabs />
      ) : (!user?.age || !user?.gender) ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        </Stack.Navigator>
      ) : (
        <PatientStackNav />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  loaderIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: COLORS.brand600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 13,
    color: COLORS.slate400,
    fontWeight: FONTS.medium,
  },
});
