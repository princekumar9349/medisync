/**
 * navigation/AppNavigator.js — Root navigation for Medisync Mobile
 * Doctor side: 4-tab premium dashboard. Patient side: unchanged.
 */
import React from 'react';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Platform, Text, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { useUIStore } from '../store/uiStore';
import { useAppTheme } from '../context/AppThemeContext';
import { COLORS, FONTS, SHADOW } from '../theme';

// Auth screens
import LoginScreen       from '../screens/LoginScreen';
import RegisterScreen    from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import PhoneVerifyScreen    from '../screens/PhoneVerifyScreen';

// Patient screens (unchanged)
import ScanScreen           from '../screens/patient/ScanScreen';
import ResultsScreen        from '../screens/patient/ResultsScreen';
import PillboxScreen        from '../screens/patient/PillboxScreen';
import ChatScreen           from '../screens/patient/ChatScreen';
import HistoryScreen        from '../screens/patient/HistoryScreen';
import ProfileScreen        from '../screens/patient/ProfileScreen';
import OnboardingScreen     from '../screens/patient/OnboardingScreen';
import SymptomReportScreen  from '../screens/patient/SymptomReportScreen';
import OCRReviewScreen        from '../screens/patient/OCRReviewScreen';
import CallingSettingsScreen        from '../screens/patient/CallingSettingsScreen';
import CaretakerDashboardScreen     from '../screens/caretaker/CaretakerDashboardScreen';
import CaretakerSettingsScreen      from '../screens/caretaker/CaretakerSettingsScreen';
import NotificationCenterScreen     from '../screens/patient/NotificationCenterScreen';
import NotificationDiagnosticsScreen from '../screens/patient/NotificationDiagnosticsScreen';
import AnalyticsDashboardScreen     from '../screens/patient/AnalyticsDashboardScreen';
import DataPrivacySettingsScreen    from '../screens/patient/DataPrivacySettingsScreen';
import PrivacyPolicyScreen          from '../screens/patient/PrivacyPolicyScreen';
import EmergencyScreen              from '../screens/patient/EmergencyScreen';

// Admin / Demo Screens
import DemoScenarioScreen           from '../screens/admin/DemoScenarioScreen';

// Doctor screens
import DoctorDashboardScreen     from '../screens/doctor/DoctorDashboardScreen';
import DoctorInboxScreen         from '../screens/doctor/DoctorInboxScreen';
import DoctorPatientsScreen      from '../screens/doctor/DoctorPatientsScreen';
import DoctorAlertsScreen        from '../screens/doctor/DoctorAlertsScreen';
import DoctorNotificationsScreen from '../screens/doctor/DoctorNotificationsScreen';
import DoctorPatientDetailScreen from '../screens/doctor/DoctorPatientDetailScreen';
import DoctorSearchScreen        from '../screens/doctor/DoctorSearchScreen';
import DoctorProfileScreen       from '../screens/doctor/DoctorProfileScreen';
import DoctorPatientChatScreen   from '../screens/doctor/DoctorPatientChatScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ─── Custom floating tab bar (NativeWind & Glassmorphism) ─────────────────────

function FloatingTabBar({ state, descriptors, navigation }) {
  const { isElderlyMode, isHighContrast } = useUIStore();
  
  const TAB_LABELS = { History: 'Home', Pillbox: 'Pillbox', Scan: '', Chat: 'Chat', Profile: 'Profile' };
  const TAB_ICONS  = {
    History: ['time', 'time-outline'],
    Pillbox: ['medkit', 'medkit-outline'],
    Chat:    ['chatbubble', 'chatbubble-outline'],
    Profile: ['person', 'person-outline'],
  };

  const containerClass = `absolute bottom-0 left-0 right-0 px-4 ${Platform.OS === 'ios' ? 'pb-8' : 'pb-4'} pt-2 bg-transparent`;
  const barClass = `flex-row items-center rounded-full px-2 py-3 shadow-lg elevation-xl ${isHighContrast ? 'bg-white border-2 border-black' : 'bg-white/90 border border-white/40'}`;
  const iconSize = isElderlyMode ? 28 : 24;

  return (
    <View className={containerClass}>
      <View className={barClass} style={{ backdropFilter: 'blur(10px)' }}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const isScan    = route.name === 'Scan';

          function onPress() {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          }

          if (isScan) return (
            <TouchableOpacity key={route.key} onPress={onPress} className="flex-1 items-center justify-center -mt-6" activeOpacity={0.85}>
              <View className={`rounded-full items-center justify-center border-4 border-white shadow-md ${isElderlyMode ? 'w-16 h-16' : 'w-14 h-14'} ${isHighContrast ? 'bg-black' : 'bg-teal-600'}`}>
                <Ionicons name="scan" size={iconSize + 4} color={COLORS.white} />
              </View>
            </TouchableOpacity>
          );

          const icons = TAB_ICONS[route.name] || ['ellipse', 'ellipse-outline'];
          return (
            <TouchableOpacity key={route.key} onPress={onPress} className="flex-1 items-center justify-center py-1 relative" activeOpacity={0.75}>
              {isFocused && <View className={`absolute -top-1 w-8 h-1 rounded-full ${isHighContrast ? 'bg-black' : 'bg-teal-600'}`} />}
              <Ionicons name={isFocused ? icons[0] : icons[1]} size={iconSize} color={isFocused ? (isHighContrast ? COLORS.black : COLORS.brand600) : COLORS.slate400} />
              <Text className={`${isElderlyMode ? 'text-xs mt-1' : 'text-[10px] mt-0.5'} ${isFocused ? (isHighContrast ? 'text-black font-extrabold' : 'text-teal-700 font-bold') : 'text-gray-500 font-medium'}`} numberOfLines={1}>
                {TAB_LABELS[route.name]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Patient Tabs ─────────────────────────────────────────────────────────────
function PatientTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Pillbox" component={PillboxScreen} />
      <Tab.Screen name="Scan"    component={ScanScreen} />
      <Tab.Screen name="Chat"    component={ChatScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ─── Patient Stack (wraps tabs + analytics as pushable stack screens) ─────────
function PatientStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientTabs"        component={PatientTabs} />
      <Stack.Screen name="AnalyticsDashboard" component={AnalyticsDashboardScreen} />
      <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} />
      <Stack.Screen name="NotificationDiagnostics" component={NotificationDiagnosticsScreen} />
      <Stack.Screen name="SymptomReport"      component={SymptomReportScreen} />
      <Stack.Screen name="DataPrivacySettings" component={DataPrivacySettingsScreen} />
      <Stack.Screen name="PrivacyPolicy"      component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}


// ─── Doctor Patients Stack ────────────────────────────────────────────────────
function DoctorPatientsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PatientsList"    component={DoctorPatientsScreen} />
      <Stack.Screen name="PatientDetail"   component={DoctorPatientDetailScreen} />
      <Stack.Screen name="SearchPatients"  component={DoctorSearchScreen} />
    </Stack.Navigator>
  );
}

// ─── Doctor Tab Bar ───────────────────────────────────────────────────────────
function DoctorTabs() {
  const TAB_BG = '#0A4A6E';
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          const icons = {
            Dashboard: focused ? 'grid' : 'grid-outline',
            Patients:  focused ? 'people' : 'people-outline',
            Inbox:     focused ? 'mail' : 'mail-outline',
            Alerts:    focused ? 'notifications' : 'notifications-outline',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={22} color={color} />;
        },
        tabBarActiveTintColor: '#38BDF8',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
        tabBarStyle: {
          backgroundColor: TAB_BG,
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 85 : 68,
          paddingBottom: Platform.OS === 'ios' ? 25 : 10,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 10,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DoctorDashboardScreen} options={{ tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Patients"  component={DoctorPatientsStack}   options={{ tabBarLabel: 'Patients' }} />
      <Tab.Screen name="Inbox"     component={DoctorInboxScreen}     options={{ tabBarLabel: 'Inbox' }} />
      <Tab.Screen name="Alerts"    component={DoctorNotificationsScreen} options={{ tabBarLabel: 'Alerts' }} />
    </Tab.Navigator>
  );
}

// ─── Doctor Root Stack (includes profile modal) ───────────────────────────────
function DoctorRoot() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DoctorTabs"       component={DoctorTabs} />
      <Stack.Screen name="DoctorProfile"    component={DoctorProfileScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="DoctorPatientChat" component={DoctorPatientChatScreen} />
    </Stack.Navigator>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────
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
      <Stack.Screen name="PatientTabs"           component={PatientTabs} />
      <Stack.Screen name="Results"               component={ResultsScreen} />
      <Stack.Screen name="OCRReview"             component={OCRReviewScreen} />
      <Stack.Screen name="SymptomReport"         component={SymptomReportScreen} />
      <Stack.Screen name="CallingSettings"       component={CallingSettingsScreen} />
      <Stack.Screen name="CaretakerSettings"     component={CaretakerSettingsScreen} />
      <Stack.Screen name="NotificationCenter"    component={NotificationCenterScreen} />
      {/* ✅ Fix: both names registered so FCM deep-links work */}
      <Stack.Screen name="NotificationDebug"     component={NotificationDiagnosticsScreen} />
      <Stack.Screen name="NotificationDiagnostics" component={NotificationDiagnosticsScreen} />
      <Stack.Screen name="DataPrivacySettings"   component={DataPrivacySettingsScreen} />
      <Stack.Screen name="PrivacyPolicy"         component={PrivacyPolicyScreen} />
      <Stack.Screen name="PhoneVerify"           component={PhoneVerifyScreen} />
      {/* ✅ Fix: doctor message notifications tap → Chat screen for patient */}
      <Stack.Screen name="DoctorPatientChat"     component={ChatScreen} />
      {/* 🆘 Emergency instant doctor chat */}
      <Stack.Screen name="Emergency"             component={EmergencyScreen} options={{ presentation: 'modal' }} />
      {/* 🛠️ Demo Tools */}
      <Stack.Screen name="DemoScenario"          component={DemoScenarioScreen} />
    </Stack.Navigator>
  );
}

// ─── Caretaker Stack ──────────────────────────────────────────────────────────
function CaretakerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CaretakerDashboard" component={CaretakerDashboardScreen} />
    </Stack.Navigator>
  );
}

// ─── Auth Stack ───────────────────────────────────────────────────────────────
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"          component={LoginScreen} />
      <Stack.Screen name="Register"       component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="PhoneVerify"    component={PhoneVerifyScreen} />
    </Stack.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
export default function AppNavigator({ navigationRef, onReady }) {
  const { isLoggedIn, user, loading } = useAuth();
  const { isHighContrast } = useAppTheme();

  // React Navigation theme for high contrast / elder mode
  const navTheme = isHighContrast ? {
    dark: true,
    colors: {
      primary:      '#00FFCC',
      background:   '#000000',
      card:         '#111111',
      text:         '#FFFFFF',
      border:       '#444444',
      notification: '#FF4444',
    },
  } : {
    dark: false,
    colors: {
      primary:      COLORS.brand600,
      background:   '#F8FAFC',
      card:         COLORS.white,
      text:         COLORS.slate800,
      border:       COLORS.border,
      notification: COLORS.red500,
    },
  };

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer ref={navigationRef} onReady={onReady} theme={navTheme}>
      {!isLoggedIn ? (
        <AuthStack />
      ) : user?.role === 'caretaker' ? (
        // Caretaker — read-only dashboard, no onboarding, no patient tabs
        <CaretakerStack />
      ) : user?.role === 'doctor' ? (
        <DoctorRoot />
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
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  loaderIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: COLORS.brand600, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 12, fontSize: 13, color: COLORS.slate400, fontWeight: FONTS.medium },
});

