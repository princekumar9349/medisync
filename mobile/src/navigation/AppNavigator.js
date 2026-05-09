/**
 * navigation/AppNavigator.js — Root navigation for Medisync Mobile
 * Business Theme UI Update
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Platform } from 'react-native';
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

// Doctor screens
import DoctorInboxScreen    from '../screens/doctor/DoctorInboxScreen';
import DoctorPatientsScreen from '../screens/doctor/DoctorPatientsScreen';
import DoctorAlertsScreen   from '../screens/doctor/DoctorAlertsScreen';
import DoctorPatientDetailScreen from '../screens/doctor/DoctorPatientDetailScreen';
import DoctorSearchScreen   from '../screens/doctor/DoctorSearchScreen';

const Stack    = createNativeStackNavigator();
const Tab      = createBottomTabNavigator();

// ─── Custom Floating Tab Bar Button ───────────────────────────────────────────
const FloatingTabBarButton = ({ children, onPress }) => (
  <TouchableOpacity
    style={{
      top: -20,
      justifyContent: 'center',
      alignItems: 'center',
      ...SHADOW.lg,
    }}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={{
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: COLORS.brand600,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 4,
      borderColor: COLORS.white,
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

          return <Ionicons name={iconName} size={24} color={color} />;
        },
        tabBarActiveTintColor: COLORS.brand600,
        tabBarInactiveTintColor: COLORS.slate400,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          height: Platform.OS === 'ios' ? 85 : 70,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: FONTS.semibold,
          marginTop: 4,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="History" component={HistoryScreen} options={{ tabBarLabel: 'History' }} />
      <Tab.Screen name="Pillbox" component={PillboxScreen} options={{ tabBarLabel: 'Pillbox' }} />
      
      {/* Floating Center Button for Scan */}
      <Tab.Screen 
        name="Scan" 
        component={ScanScreen} 
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => <Ionicons name="scan" size={28} color={COLORS.white} />,
          tabBarButton: (props) => <FloatingTabBarButton {...props} />
        }} 
      />

      <Tab.Screen name="Chat" component={ChatScreen} options={{ tabBarLabel: 'Assistant' }} />
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
          return <Ionicons name={iconName} size={24} color={color} />;
        },
        tabBarActiveTintColor: COLORS.brand600, // Unified to blue theme
        tabBarInactiveTintColor: COLORS.slate400,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          height: Platform.OS === 'ios' ? 85 : 70,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: FONTS.semibold,
          marginTop: 4,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Inbox" component={DoctorInboxScreen} options={{ tabBarLabel: 'Inbox' }} />
      
      {/* Floating Center Button for Patients Stack */}
      <Tab.Screen 
        name="Patients" 
        component={DoctorPatientsStack} 
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => <Ionicons name="people" size={28} color={COLORS.white} />,
          tabBarButton: (props) => <FloatingTabBarButton {...props} />
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
      <View style={styles.loaderIcon}>
        <Ionicons name="medical" size={32} color={COLORS.white} />
      </View>
      <ActivityIndicator size="large" color={COLORS.brand500} style={{ marginTop: 24 }} />
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
    backgroundColor: COLORS.bgLight,
  },
  loaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.brand600,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.md,
  },
});
