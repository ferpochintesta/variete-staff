import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Importamos Firebase (Asegurate de tener tu archivo firebase.js configurado)
// import { db } from './firebase'; 
// import { collection, onSnapshot, query, where } from 'firebase/firestore';

const Tab = createBottomTabNavigator();

// --- PANTALLAS TEMPORALES (Las llenaremos en las próximas fases) ---
// Agregá esto arriba de todo junto a los otros imports
import PorteriaScreen from './screens/Porteria';
import BarraScreen from './screens/Barra';
const EventoScreen = () => <View style={styles.screen}><Text style={styles.text}>Módulo Evento</Text></View>;
const PuntosScreen = () => <View style={styles.screen}><Text style={styles.text}>Módulo Puntos</Text></View>;

// --- COMPONENTE CABECERA GLOBAL ---
const GlobalHeader = () => {
  const [genteAdentro, setGenteAdentro] = useState(0);

  // Aquí luego conectaremos onSnapshot de Firebase para contar los "ingresados"
  useEffect(() => {
    // Simulación de carga
    setGenteAdentro(0);
  }, []);

  return (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle}>Varieté Staff</Text>
      <View style={styles.counterBadge}>
        <Text style={styles.counterText}>👥 Adentro: {genteAdentro}</Text>
      </View>
    </View>
  );
};

export default function App() {
  return (
    <NavigationContainer>
      <View style={styles.appContainer}>
        <GlobalHeader />
        
        <Tab.Navigator
          screenOptions={{
            headerShown: false, // Ocultamos el header de cada pestaña porque usamos el global
            tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' },
            tabBarActiveTintColor: '#deff9a',
            tabBarInactiveTintColor: '#888',
          }}
        >
          <Tab.Screen name="Portería" component={PorteriaScreen} />
          <Tab.Screen name="Barra" component={BarraScreen} />
          <Tab.Screen name="Evento" component={EventoScreen} />
          <Tab.Screen name="Puntos" component={PuntosScreen} />
        </Tab.Navigator>
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerContainer: {
    backgroundColor: '#121212',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#deff9a',
    fontSize: 20,
    fontWeight: 'bold',
  },
  counterBadge: {
    backgroundColor: '#333',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  counterText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  screen: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 18,
  }
});