import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// 1. Descomentamos y agregamos las herramientas de Firebase
import { db } from './firebase'; 
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';

const Tab = createBottomTabNavigator();

import PorteriaScreen from './screens/Porteria';
import BarraScreen from './screens/Barra';
const EventoScreen = () => <View style={styles.screen}><Text style={styles.text}>Módulo Evento</Text></View>;
const PuntosScreen = () => <View style={styles.screen}><Text style={styles.text}>Módulo Puntos</Text></View>;

// --- COMPONENTE CABECERA GLOBAL ---
const GlobalHeader = () => {
  const [ingresosSistema, setIngresosSistema] = useState(0);
  const [ajusteManual, setAjusteManual] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    // Escuchamos la colección de órdenes para contar los que realmente ingresaron
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      let total = 0;
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status === 'pagado' || data.isManual) {
          // Sumamos los QRs escaneados
          if (data.ingresados) total += data.ingresados.length;
          // Sumamos las ventas manuales de entradas en puerta
          if (data.isManual && data.tipo === 'entrada') total += 1;
        }
      });
      setIngresosSistema(total);
    });

    // Escuchamos un documento especial para los ajustes manuales (gente que se va)
    const unsubMeta = onSnapshot(doc(db, 'metadata', 'puerta'), (docSnap) => {
      if (docSnap.exists()) {
        setAjusteManual(docSnap.data().ajusteManual || 0);
      } else {
        // Si no existe, lo creamos
        setDoc(doc(db, 'metadata', 'puerta'), { ajusteManual: 0 });
      }
    });

    return () => { unsubOrders(); unsubMeta(); };
  }, []);

  const totalAdentro = ingresosSistema + ajusteManual;

  const modificarAjuste = async (cambio) => {
    const nuevoAjuste = ajusteManual + cambio;
    await updateDoc(doc(db, 'metadata', 'puerta'), { ajusteManual: nuevoAjuste });
  };

  return (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle}>Varieté Staff</Text>
      
      {/* Botón que abre el Modal */}
      <TouchableOpacity style={styles.counterBadge} onPress={() => setModalVisible(true)}>
        <Text style={styles.counterText}>👥 Adentro: {totalAdentro}</Text>
      </TouchableOpacity>

      {/* Modal de Ajuste Manual */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ajustar Capacidad</Text>
            <Text style={{color: '#aaa', marginBottom: 5}}>Ingresos escaneados/vendidos: {ingresosSistema}</Text>
            <Text style={{color: '#aaa', marginBottom: 15}}>Ajustes manuales (salidas): {ajusteManual}</Text>
            
            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.btnAjuste, {backgroundColor: '#ff4d4d'}]} onPress={() => modificarAjuste(-1)}>
                <Text style={styles.btnAjusteText}>-1 (Alguien Salió)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnAjuste, {backgroundColor: '#deff9a'}]} onPress={() => modificarAjuste(1)}>
                <Text style={[styles.btnAjusteText, {color: '#000'}]}>+1 (Entró)</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.btnCerrarModal} onPress={() => setModalVisible(false)}>
              <Text style={{color: '#fff', fontWeight: 'bold'}}>Cerrar Panel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
            headerShown: false,
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
  appContainer: { flex: 1, backgroundColor: '#000' },
  headerContainer: { backgroundColor: '#121212', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#333' },
  headerTitle: { color: '#deff9a', fontSize: 20, fontWeight: 'bold' },
  counterBadge: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: '#555' },
  counterText: { color: '#fff', fontWeight: 'bold' },
  screen: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  text: { color: '#fff', fontSize: 18 },
  // Estilos del Modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#1a1a1a', padding: 25, borderRadius: 15, width: '100%', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#deff9a', fontSize: 22, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalRow: { flexDirection: 'row', gap: 10, marginVertical: 20 },
  btnAjuste: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center' },
  btnAjusteText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  btnCerrarModal: { backgroundColor: '#333', padding: 15, borderRadius: 8, alignItems: 'center' }
});