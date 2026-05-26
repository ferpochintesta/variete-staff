import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, FlatList, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, collection, onSnapshot, addDoc } from 'firebase/firestore';

export default function PorteriaScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ticketData, setTicketData] = useState(null);
  
  // Nuevos estados para la Fase 2.2
  const [modo, setModo] = useState('escaner'); // 'escaner' o 'lista'
  const [asistentes, setAsistentes] = useState([]);
  const [nombreManual, setNombreManual] = useState('');
  const [precioManual, setPrecioManual] = useState('');

  // Efecto para traer la lista de asistentes en tiempo real
  useEffect(() => {
    if (modo !== 'lista') return;
    
    const unsubscribe = onSnapshot(collection(db, 'orders'), (snapshot) => {
      let lista = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === 'pagado' || data.isManual) {
          // Extraemos las entradas web
          if (data.items) {
            const entradas = data.items.filter(i => i.id.startsWith('ent'));
            entradas.forEach(ent => {
              const asisList = ent.asistentes || ['Asistente sin nombre'];
              asisList.forEach((nombre, idx) => {
                const yaIngreso = data.ingresados && data.ingresados.includes(idx.toString());
                lista.push({ id: `${docSnap.id}-${idx}`, nombre, tipo: 'Web', yaIngreso, refId: docSnap.id });
              });
            });
          }
          // Extraemos las entradas manuales (efectivo en puerta)
          if (data.isManual && data.tipo === 'entrada') {
            lista.push({ id: docSnap.id, nombre: data.nombre, tipo: 'Efectivo', yaIngreso: true, refId: docSnap.id });
          }
        }
      });
      setAsistentes(lista);
    });

    return () => unsubscribe();
  }, [modo]);

  // --- LÓGICA DEL ESCÁNER (Igual que antes) ---
  const handleBarCodeScanned = async ({ data }) => {
    setScanned(true);
    setLoading(true);
    try {
      const parts = data.split('-T');
      const orderId = parts[0];
      const ticketIndex = parts[1];

      if (!ticketIndex) {
        Alert.alert("QR Incorrecto", "Este código es de consumición, usá el módulo Barra.", [{ text: "OK", onPress: () => setScanned(false) }]);
        setLoading(false); return;
      }

      const docRef = doc(db, 'orders', orderId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const order = docSnap.data();
        const yaIngreso = order.ingresados && order.ingresados.includes(ticketIndex);
        setTicketData({ orderId, ticketIndex, yaIngreso });
      } else {
        Alert.alert("Error", "Entrada no encontrada.");
      }
    } catch (error) {
      Alert.alert("Error", "Fallo de conexión.");
    }
    setLoading(false);
  };

  const confirmarIngreso = async () => {
    if (!ticketData) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'orders', ticketData.orderId);
      await updateDoc(docRef, { ingresados: arrayUnion(ticketData.ticketIndex) });
      Alert.alert("✅ Éxito", "Ingreso registrado.");
      setTicketData(null);
      setScanned(false);
    } catch (error) {
      Alert.alert("Error", "No se pudo registrar.");
    } finally {
      setLoading(false);
    }
  };

  // --- LÓGICA MANUAL (Efectivo) ---
  const agregarManual = async () => {
    if (!nombreManual || !precioManual) {
      Alert.alert("Faltan datos", "Completá nombre y precio.");
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'orders'), {
        isManual: true,
        tipo: 'entrada',
        nombre: nombreManual,
        precio: Number(precioManual),
        metodoPago: 'efectivo',
        status: 'pagado',
        createdAt: new Date()
      });
      setNombreManual('');
      setPrecioManual('');
      Alert.alert("✅ Agregado", "Entrada manual cobrada y registrada.");
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar.");
    }
    setLoading(false);
  };

  // --- RENDERIZADO ---
  if (!permission) return <View style={styles.center}><ActivityIndicator size="large" color="#deff9a" /></View>;
  if (!permission.granted) return (
    <View style={styles.center}>
      <Text style={styles.text}>Permiso de cámara requerido.</Text>
      <TouchableOpacity style={styles.btnAcept} onPress={requestPermission}><Text>Otorgar</Text></TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Pestañas Superiores */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, modo === 'escaner' && styles.tabActive]} onPress={() => setModo('escaner')}>
          <Text style={[styles.tabText, modo === 'escaner' && styles.tabTextActive]}>📷 Escáner</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, modo === 'lista' && styles.tabActive]} onPress={() => setModo('lista')}>
          <Text style={[styles.tabText, modo === 'lista' && styles.tabTextActive]}>📋 Lista / Manual</Text>
        </TouchableOpacity>
      </View>

      {/* VISTA ESCÁNER */}
      {modo === 'escaner' && (
        <>
          <View style={styles.cameraContainer}>
            <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} />
            <View style={styles.overlay}><View style={styles.scanFrame} /></View>
          </View>
          <View style={styles.panel}>
            {loading && <ActivityIndicator size="large" color="#deff9a" />}
            {!loading && !ticketData && <Text style={styles.infoText}>Apuntá a un QR para escanear...</Text>}
            {!loading && ticketData && (
              <View style={styles.resultCard}>
                <Text style={[styles.statusTitle, { color: ticketData.yaIngreso ? '#ff4d4d' : '#deff9a' }]}>
                  {ticketData.yaIngreso ? '🔴 YA INGRESADO' : '🟢 ENTRADA VÁLIDA'}
                </Text>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btnAccion, { backgroundColor: ticketData.yaIngreso ? '#555' : '#deff9a' }]} disabled={ticketData.yaIngreso} onPress={confirmarIngreso}>
                    <Text style={{ fontWeight: 'bold', color: ticketData.yaIngreso ? '#aaa' : '#000' }}>{ticketData.yaIngreso ? 'Usada' : 'Dar Ingreso'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnAccion, { backgroundColor: '#333' }]} onPress={() => { setTicketData(null); setScanned(false); }}>
                    <Text style={{ color: '#fff' }}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </>
      )}

      {/* VISTA LISTA Y MANUAL */}
      {modo === 'lista' && (
        <View style={styles.listaContainer}>
          {/* Formulario Efectivo */}
          <View style={styles.manualForm}>
            <Text style={{ color: '#fff', marginBottom: 10, fontWeight: 'bold' }}>💵 Venta en Puerta (Efectivo)</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 2 }]} placeholder="Nombre..." placeholderTextColor="#666" value={nombreManual} onChangeText={setNombreManual} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="$ UYU" placeholderTextColor="#666" keyboardType="numeric" value={precioManual} onChangeText={setPrecioManual} />
            </View>
            <TouchableOpacity style={styles.btnManual} onPress={agregarManual} disabled={loading}>
              <Text style={{ fontWeight: 'bold' }}>{loading ? 'Guardando...' : 'Cobrar e Ingresar'}</Text>
            </TouchableOpacity>
          </View>

          {/* Lista de Asistentes */}
          <Text style={{ color: '#deff9a', marginVertical: 10, fontWeight: 'bold', fontSize: 16 }}>Asistentes Registrados</Text>
          <FlatList
            data={asistentes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <View>
                  <Text style={{ color: '#fff', fontSize: 16 }}>{item.nombre}</Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>Origen: {item.tipo}</Text>
                </View>
                <Text style={{ color: item.yaIngreso ? '#deff9a' : '#ff4d4d', fontWeight: 'bold' }}>
                  {item.yaIngreso ? '✓ Adentro' : 'Falta'}
                </Text>
              </View>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  text: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  tabs: { flexDirection: 'row', backgroundColor: '#1a1a1a' },
  tab: { flex: 1, padding: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#deff9a' },
  tabText: { color: '#888', fontWeight: 'bold' },
  tabTextActive: { color: '#deff9a' },
  cameraContainer: { flex: 2, position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: '#deff9a' },
  panel: { flex: 1, backgroundColor: '#1a1a1a', padding: 20 },
  infoText: { color: '#888', textAlign: 'center', fontSize: 16, marginTop: 20 },
  resultCard: { backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  statusTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 15 },
  btnAccion: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center' },
  listaContainer: { flex: 1, padding: 15 },
  manualForm: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10, marginBottom: 10 },
  input: { backgroundColor: '#000', color: '#fff', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  btnManual: { backgroundColor: '#deff9a', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 15, borderRadius: 8, marginBottom: 8 }
});