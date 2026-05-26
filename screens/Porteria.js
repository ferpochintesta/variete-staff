import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, FlatList, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, collection, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';

export default function PorteriaScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ticketData, setTicketData] = useState(null);
  
  const [modo, setModo] = useState('escaner'); 
  const [asistentes, setAsistentes] = useState([]);
  const [nombreManual, setNombreManual] = useState('');
  const [precioManual, setPrecioManual] = useState('');
  
  // NUEVO: Estado para el ID manual del escáner
  const [idBuscador, setIdBuscador] = useState('');

  useEffect(() => {
    if (modo !== 'lista') return;
    
    const unsubscribe = onSnapshot(collection(db, 'orders'), (snapshot) => {
      let lista = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.status === 'pagado' || data.isManual) {
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
          if (data.isManual && data.tipo === 'entrada') {
            lista.push({ id: docSnap.id, nombre: data.nombre, tipo: 'Efectivo', yaIngreso: true, refId: docSnap.id });
          }
        }
      });
      setAsistentes(lista);
    });

    return () => unsubscribe();
  }, [modo]);

  // --- LÓGICA DEL ESCÁNER Y BUSCADOR MANUAL ---
  // Extraje el motor de búsqueda para usarlo con la cámara y con el texto
  const procesarCodigo = async (codigoBruto) => {
    setScanned(true);
    setLoading(true);
    try {
      // Inteligencia: Si el staff pone solo "1234", asumimos que es el ticket 0 ("1234-T0")
      const codigoSeguro = codigoBruto.includes('-T') ? codigoBruto : `${codigoBruto}-T0`;
      
      const parts = codigoSeguro.split('-T');
      const orderId = parts[0];
      const ticketIndex = parts[1];

      const docRef = doc(db, 'orders', orderId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const order = docSnap.data();
        // Validar que tenga entradas
        const tieneEntradas = order.items && order.items.some(i => i.id.startsWith('ent'));
        if (!tieneEntradas && !order.isManual) {
            Alert.alert("QR Incorrecto", "Este código es de consumición de barra.", [{ text: "OK", onPress: () => setScanned(false) }]);
            setLoading(false); return;
        }

        const yaIngreso = order.ingresados && order.ingresados.includes(ticketIndex);
        setTicketData({ orderId, ticketIndex, yaIngreso });
        setIdBuscador(''); // Limpiamos el buscador
      } else {
        Alert.alert("Error", "Entrada no encontrada en la base de datos.");
        setScanned(false);
      }
    } catch (error) {
      Alert.alert("Error", "Fallo de conexión.");
      setScanned(false);
    }
    setLoading(false);
  };

  const handleBarCodeScanned = ({ data }) => procesarCodigo(data);
  const buscarIdManual = () => {
    if(!idBuscador) return;
    procesarCodigo(idBuscador.trim());
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

  // --- LÓGICA MANUAL Y LISTA ---
  const agregarManual = async () => {
    if (!nombreManual || !precioManual) return Alert.alert("Faltan datos", "Completá nombre y precio.");
    setLoading(true);
    try {
      await addDoc(collection(db, 'orders'), {
        isManual: true, tipo: 'entrada', nombre: nombreManual, precio: Number(precioManual), metodoPago: 'efectivo', status: 'pagado', createdAt: new Date()
      });
      setNombreManual(''); setPrecioManual('');
      Alert.alert("✅ Agregado", "Entrada manual cobrada y registrada.");
    } catch (error) { Alert.alert("Error", "No se pudo guardar."); }
    setLoading(false);
  };

  const ingresarDesdeLista = async (item) => {
    try {
      const idx = item.id.split('-')[1]; // Extraemos si es ticket 0, 1, 2...
      await updateDoc(doc(db, 'orders', item.refId), { ingresados: arrayUnion(idx) });
    } catch (e) { Alert.alert("Error", "No se pudo ingresar."); }
  };

  const eliminarAsistente = (item) => {
    Alert.alert(
      "Eliminar Registro", 
      `¿Seguro que querés eliminar el registro de ${item.nombre} de la base de datos? Esto no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Borrar", style: "destructive", onPress: async () => {
            await deleteDoc(doc(db, 'orders', item.refId));
        }}
      ]
    );
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
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, modo === 'escaner' && styles.tabActive]} onPress={() => setModo('escaner')}>
          <Text style={[styles.tabText, modo === 'escaner' && styles.tabTextActive]}>📷 Escáner</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, modo === 'lista' && styles.tabActive]} onPress={() => setModo('lista')}>
          <Text style={[styles.tabText, modo === 'lista' && styles.tabTextActive]}>📋 Lista / Manual</Text>
        </TouchableOpacity>
      </View>

      {modo === 'escaner' && (
        <>
          <View style={styles.cameraContainer}>
            <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarCodeScanned} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} />
            <View style={styles.overlay}><View style={styles.scanFrame} /></View>
          </View>
          <View style={styles.panel}>
            
            {/* NUEVO: Buscador de ID Manual */}
            {!ticketData && (
              <View style={styles.buscadorContainer}>
                <TextInput 
                  style={styles.inputBuscador} 
                  placeholder="ID..." 
                  placeholderTextColor="#666"
                  value={idBuscador}
                  onChangeText={setIdBuscador}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.btnBuscar} onPress={buscarIdManual} disabled={loading}>
                  <Text style={{fontWeight: 'bold'}}>{loading ? '...' : 'Buscar'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {loading && <ActivityIndicator size="large" color="#deff9a" style={{marginTop: 20}} />}
            
            {!loading && !ticketData && <Text style={styles.infoText}>Apuntá a un QR o ingresá el ID manualmente.</Text>}
            
            {!loading && ticketData && (
              <View style={styles.resultCard}>
                <Text style={[styles.statusTitle, { color: ticketData.yaIngreso ? '#ff4d4d' : '#deff9a' }]}>
                  {ticketData.yaIngreso ? '🔴 YA INGRESADO' : '🟢 ENTRADA VÁLIDA'}
                </Text>
                <Text style={{color: '#aaa', textAlign: 'center', marginBottom: 10}}>Ticket #: {ticketData.ticketIndex}</Text>
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

      {modo === 'lista' && (
        <View style={styles.listaContainer}>
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

          <Text style={{ color: '#deff9a', marginVertical: 10, fontWeight: 'bold', fontSize: 16 }}>Asistentes Registrados</Text>
          <FlatList
            data={asistentes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 16 }}>{item.nombre}</Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>Origen: {item.tipo}</Text>
                </View>
                
                {/* NUEVO: Botonera de la lista */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {!item.yaIngreso ? (
                    <TouchableOpacity style={styles.btnListaIngreso} onPress={() => ingresarDesdeLista(item)}>
                      <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12 }}>Ingresar</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: '#deff9a', fontWeight: 'bold', fontSize: 13 }}>✓ Adentro</Text>
                  )}
                  
                  <TouchableOpacity style={styles.btnListaBorrar} onPress={() => eliminarAsistente(item)}>
                    <Text style={{ color: '#fff', fontSize: 14 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>

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
  panel: { flex: 1.2, backgroundColor: '#1a1a1a', padding: 20 },
  infoText: { color: '#888', textAlign: 'center', fontSize: 14, marginTop: 15 },
  resultCard: { backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  statusTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 5, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 15 },
  btnAccion: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center' },
  listaContainer: { flex: 1, padding: 15 },
  manualForm: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10, marginBottom: 10 },
  input: { backgroundColor: '#000', color: '#fff', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  btnManual: { backgroundColor: '#deff9a', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 15, borderRadius: 8, marginBottom: 8 },
  // Nuevos estilos para el buscador y botones de lista
  buscadorContainer: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  inputBuscador: { flex: 1, backgroundColor: '#000', color: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  btnBuscar: { backgroundColor: '#deff9a', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8 },
  btnListaIngreso: { backgroundColor: '#deff9a', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  btnListaBorrar: { backgroundColor: '#ff4d4d', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6 }
});