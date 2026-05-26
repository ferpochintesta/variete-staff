import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, FlatList, TextInput } from 'react-native';
import { CameraView } from 'expo-camera';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';

export default function BarraScreen() {
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pedidoData, setPedidoData] = useState(null);
  const [modo, setModo] = useState('escaner'); 

  // Estados para el Inventario (Stock)
  const [productos, setProductos] = useState([]);
  const [prodNombre, setProdNombre] = useState('');
  const [prodPrecio, setProdPrecio] = useState('');
  const [prodStock, setProdStock] = useState(''); 
  const [prodCategoria, setProdCategoria] = useState('bebida'); // NUEVO: Estado de categoría

  useEffect(() => {
    if (modo !== 'stock' && modo !== 'pedidos') return;
    
    const unsubscribe = onSnapshot(collection(db, 'productosBarra'), (snapshot) => {
      let lista = [];
      snapshot.forEach((doc) => {
        lista.push({ id: doc.id, ...doc.data() });
      });
      // Ordenamos alfabéticamente para que se vea más prolijo
      lista.sort((a, b) => a.name.localeCompare(b.name));
      setProductos(lista);
    });

    return () => unsubscribe();
  }, [modo]);

  // --- LÓGICA DEL ESCÁNER ---
  const handleBarCodeScanned = async ({ data }) => {
    if (data.includes('-T')) {
      Alert.alert("QR Incorrecto", "Este código es una Entrada. Escanealo en Portería.");
      setScanned(false); return;
    }

    setScanned(true); setLoading(true);

    try {
      const docRef = doc(db, 'orders', data);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const order = docSnap.data();
        const consumiciones = order.items ? order.items.filter(i => !i.id.startsWith('ent')) : [];

        if (consumiciones.length === 0) {
          Alert.alert("Pedido sin Barra", "Este pedido no incluye productos.");
          setScanned(false); setLoading(false); return;
        }

        setPedidoData({ orderId: data, items: consumiciones, yaEntregado: order.barraEntregada || false });
      } else {
        Alert.alert("Error", "Pedido no encontrado.");
        setScanned(false);
      }
    } catch (error) {
      Alert.alert("Error", "Fallo al conectar.");
      setScanned(false);
    } finally {
      setLoading(false);
    }
  };

  const entregarProductos = async () => {
    if (!pedidoData) return;
    setLoading(true);
    try {
      const docRef = doc(db, 'orders', pedidoData.orderId);
      await updateDoc(docRef, { barraEntregada: true, barraEntregadoAt: new Date() });
      Alert.alert("✅ Despachado", "Productos entregados.");
      setPedidoData(null); setScanned(false);
    } catch (error) {
      Alert.alert("Error", "No se pudo actualizar.");
    } finally {
      setLoading(false);
    }
  };

  // --- LÓGICA DE STOCK ---
  const agregarProducto = async () => {
    if (!prodNombre || !prodPrecio) {
      Alert.alert("Datos incompletos", "El nombre y el precio son obligatorios.");
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'productosBarra'), {
        name: prodNombre,
        price: Number(prodPrecio),
        stock: prodStock === '' ? null : Number(prodStock),
        categoria: prodCategoria, // NUEVO: Guardamos si es bebida o comida
        createdAt: new Date()
      });
      setProdNombre(''); setProdPrecio(''); setProdStock('');
      Alert.alert("✅ Agregado", "Producto disponible en la web.");
    } catch (error) {
      Alert.alert("Error", "No se pudo guardar el producto.");
    }
    setLoading(false);
  };

  const eliminarProducto = async (id) => {
    Alert.alert("Eliminar", "¿Seguro que querés borrar este producto del menú?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
          await deleteDoc(doc(db, 'productosBarra', id));
      }}
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, modo === 'escaner' && styles.tabActive]} onPress={() => setModo('escaner')}>
          <Text style={[styles.tabText, modo === 'escaner' && styles.tabTextActive]}>📷 Escáner</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, modo === 'pedidos' && styles.tabActive]} onPress={() => setModo('pedidos')}>
          <Text style={[styles.tabText, modo === 'pedidos' && styles.tabTextActive]}>🍹 Ventas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, modo === 'stock' && styles.tabActive]} onPress={() => setModo('stock')}>
          <Text style={[styles.tabText, modo === 'stock' && styles.tabTextActive]}>📦 Stock</Text>
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
            {!loading && !pedidoData && <Text style={styles.infoText}>Escaneá el QR de barra...</Text>}
            
            {!loading && pedidoData && (
              <View style={styles.resultCard}>
                <Text style={[styles.statusTitle, { color: pedidoData.yaEntregado ? '#ff4d4d' : '#deff9a' }]}>
                  {pedidoData.yaEntregado ? '🔴 YA ENTREGADO' : '🟢 PEDIDO PENDIENTE'}
                </Text>
                
                <View style={styles.itemsList}>
                  {pedidoData.items.map((item, index) => (
                    <Text key={index} style={styles.itemText}>• <Text style={{ fontWeight: 'bold', color: '#fff' }}>{item.quantity}x</Text> {item.name}</Text>
                  ))}
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btnAccion, { backgroundColor: pedidoData.yaEntregado ? '#555' : '#deff9a' }]} disabled={pedidoData.yaEntregado} onPress={entregarProductos}>
                    <Text style={{ fontWeight: 'bold', color: pedidoData.yaEntregado ? '#aaa' : '#000' }}>{pedidoData.yaEntregado ? 'Ya retirado' : 'Entregar'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnAccion, { backgroundColor: '#333' }]} onPress={() => { setPedidoData(null); setScanned(false); }}>
                    <Text style={{ color: '#fff' }}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </>
      )}

      {/* VISTA STOCK / INVENTARIO */}
      {modo === 'stock' && (
        <View style={styles.listaContainer}>
          <View style={styles.manualForm}>
            <Text style={{ color: '#fff', marginBottom: 10, fontWeight: 'bold' }}>➕ Nuevo Producto al Menú</Text>
            
            {/* NUEVO: Selector de Categoría */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity 
                style={[styles.btnCat, prodCategoria === 'bebida' && styles.btnCatActive]} 
                onPress={() => setProdCategoria('bebida')}
              >
                <Text style={[styles.catText, prodCategoria === 'bebida' && { color: '#000' }]}>🍺 Bebida</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.btnCat, prodCategoria === 'comida' && styles.btnCatActive]} 
                onPress={() => setProdCategoria('comida')}
              >
                <Text style={[styles.catText, prodCategoria === 'comida' && { color: '#000' }]}>🍔 Comida</Text>
              </TouchableOpacity>
            </View>

            <TextInput style={[styles.input, { marginBottom: 10 }]} placeholder="Nombre (ej. Cerveza IPA)" placeholderTextColor="#666" value={prodNombre} onChangeText={setProdNombre} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Precio $" placeholderTextColor="#666" keyboardType="numeric" value={prodPrecio} onChangeText={setProdPrecio} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Stock (Vacío=Inf)" placeholderTextColor="#666" keyboardType="numeric" value={prodStock} onChangeText={setProdStock} />
            </View>
            <TouchableOpacity style={styles.btnManual} onPress={agregarProducto} disabled={loading}>
              <Text style={{ fontWeight: 'bold' }}>{loading ? 'Guardando...' : 'Agregar al Menú'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: '#deff9a', marginVertical: 10, fontWeight: 'bold', fontSize: 16 }}>Productos Activos</Text>
          <FlatList
            data={productos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.listItem}>
                <View>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    {item.categoria === 'comida' ? '🍔' : '🍺'} {item.name}
                  </Text>
                  <Text style={{ color: '#888', fontSize: 13 }}>
                    Precio: ${item.price} • Stock: {item.stock === null ? '∞ Infinito' : item.stock}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => eliminarProducto(item.id)}>
                  <Text style={{ color: '#ff4d4d', fontSize: 20 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}

      {/* VISTA VENTAS */}
      {modo === 'pedidos' && (
         <View style={styles.center}><Text style={{ color: '#fff' }}>Próximamente: Panel para cobrar en efectivo en la barra</Text></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#1a1a1a' },
  tab: { flex: 1, padding: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#deff9a' },
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 13 },
  tabTextActive: { color: '#deff9a' },
  cameraContainer: { flex: 1.5, position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 220, height: 220, borderWidth: 2, borderColor: '#deff9a' },
  panel: { flex: 1.2, backgroundColor: '#1a1a1a', padding: 20 },
  infoText: { color: '#888', textAlign: 'center', fontSize: 16, marginTop: 20 },
  resultCard: { backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  statusTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  itemsList: { backgroundColor: '#111', padding: 12, borderRadius: 6, marginBottom: 15 },
  itemText: { color: '#ccc', fontSize: 16, paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  btnAccion: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center' },
  listaContainer: { flex: 1, padding: 15 },
  manualForm: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10, marginBottom: 10 },
  input: { backgroundColor: '#000', color: '#fff', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  btnManual: { backgroundColor: '#deff9a', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 15, borderRadius: 8, marginBottom: 8 },
  // Estilos nuevos para los botones de categoría
  btnCat: { flex: 1, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  btnCatActive: { backgroundColor: '#deff9a', borderColor: '#deff9a' },
  catText: { color: '#fff', fontWeight: 'bold' }
});