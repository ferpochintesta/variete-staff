import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, FlatList, TextInput, ScrollView } from 'react-native';
import { CameraView } from 'expo-camera';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, onSnapshot, addDoc, deleteDoc, increment } from 'firebase/firestore';

export default function BarraScreen() {
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pedidoData, setPedidoData] = useState(null);
  const [modo, setModo] = useState('escaner'); 
  
  const [idBuscador, setIdBuscador] = useState('');
  const [productos, setProductos] = useState([]);
  const [ventasBarra, setVentasBarra] = useState([]);
  
  const [prodNombre, setProdNombre] = useState('');
  const [prodPrecio, setProdPrecio] = useState('');
  const [prodStock, setProdStock] = useState(''); 
  const [prodCategoria, setProdCategoria] = useState('bebida');

  const [cartManual, setCartManual] = useState({});

  useEffect(() => {
    const unsubProductos = onSnapshot(collection(db, 'productosBarra'), (snapshot) => {
      let lista = [];
      snapshot.forEach((doc) => lista.push({ id: doc.id, ...doc.data() }));
      lista.sort((a, b) => a.name.localeCompare(b.name));
      setProductos(lista);
    });

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      let ordenes = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const hasBarItems = data.items && data.items.some(i => !i.id.startsWith('ent'));
        const isManualBar = data.isManual && data.tipo === 'barra';
        
        if (data.status === 'pagado' && (hasBarItems || isManualBar)) {
          ordenes.push({ id: docSnap.id, ...data });
        }
      });
      ordenes.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setVentasBarra(ordenes);
    });

    return () => { unsubProductos(); unsubOrders(); };
  }, []);

  // --- LÓGICA DEL ESCÁNER Y BUSCADOR INTELIGENTE ---
  const procesarCodigo = async (codigoBruto) => {
    // 1. Limpiamos espacios
    const codigoLimpio = codigoBruto.replace(/\s+/g, '').trim();
    if (!codigoLimpio) return;

    // 2. Extraemos el primer número
    const primerDigito = parseInt(codigoLimpio.charAt(0));

    // 3. INTELIGENCIA: Si empieza del 7 al 9, sabemos que es de Portería
    if (primerDigito >= 7 && primerDigito <= 9) {
      Alert.alert("🛑 QR Incorrecto", "Este código es una ENTRADA. Decile a la persona que lo muestre en la puerta.", [{ text: "Entendido", onPress: () => setScanned(false) }]);
      return;
    }

    setScanned(true); setLoading(true);
    try {
      const docRef = doc(db, 'orders', codigoLimpio);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const order = docSnap.data();
        const consumiciones = order.items ? order.items.filter(i => !i.id.startsWith('ent')) : [];

        if (consumiciones.length === 0) {
          Alert.alert("Pedido sin Barra", "Este pedido no incluye productos.", [{ text: "OK", onPress: () => setScanned(false) }]);
        } else {
          setPedidoData({ orderId: docSnap.id, items: consumiciones, yaEntregado: order.barraEntregada || false });
          setIdBuscador('');
        }
      } else {
        Alert.alert("Error", "Pedido no encontrado.", [{ text: "OK", onPress: () => setScanned(false) }]);
      }
    } catch (error) { Alert.alert("Error", "Fallo al conectar.", [{ text: "OK", onPress: () => setScanned(false) }]); }
    setLoading(false);
  };

  const entregarProductos = async () => {
    if (!pedidoData) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'orders', pedidoData.orderId), { barraEntregada: true, barraEntregadoAt: new Date() });
      Alert.alert("✅ Despachado", "Productos entregados.");
      setPedidoData(null); setScanned(false);
    } catch (error) { Alert.alert("Error", "No se pudo actualizar."); }
    setLoading(false);
  };

  // --- LÓGICA DE VENTAS MANUALES ---
  const updateCart = (item, delta) => {
    setCartManual(prev => {
      const currentQty = prev[item.id]?.quantity || 0;
      const newQty = currentQty + delta;
      if (delta > 0 && item.stock !== null && newQty > item.stock) return prev; 
      const newCart = { ...prev };
      if (newQty <= 0) delete newCart[item.id];
      else newCart[item.id] = { ...item, quantity: newQty };
      return newCart;
    });
  };

  const totalManual = Object.values(cartManual).reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const cobrarVentaManual = async () => {
    if (Object.keys(cartManual).length === 0) return;
    setLoading(true);
    try {
      const itemsToBuy = Object.values(cartManual).map(i => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price }));
      
      await addDoc(collection(db, 'orders'), {
        isManual: true, tipo: 'barra', items: itemsToBuy, total: totalManual, status: 'pagado', 
        barraEntregada: true, metodoPago: 'efectivo', createdAt: new Date()
      });

      for (const item of itemsToBuy) {
        const prod = productos.find(p => p.id === item.id);
        if (prod && prod.stock !== null) {
          await updateDoc(doc(db, 'productosBarra', item.id), { stock: increment(-item.quantity) });
        }
      }

      setCartManual({});
      Alert.alert("✅ Venta Exitosa", "Cobrado en efectivo y stock descontado.");
    } catch (error) { Alert.alert("Error", "Fallo al procesar la venta."); }
    setLoading(false);
  };

  const eliminarOrden = (orden) => {
    Alert.alert("Eliminar Venta", "¿Seguro que querés borrar esta venta? Se restaurará el stock de los productos.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => {
          setLoading(true);
          if (orden.items) {
            for (const item of orden.items) {
              const prod = productos.find(p => p.id === item.id);
              if (prod && prod.stock !== null) {
                await updateDoc(doc(db, 'productosBarra', item.id), { stock: increment(item.quantity) });
              }
            }
          }
          await deleteDoc(doc(db, 'orders', orden.id));
          setLoading(false);
      }}
    ]);
  };

  const calcularResumen = (productoId) => {
    let vendidos = 0;
    let entregados = 0;
    ventasBarra.forEach(orden => {
      if (orden.items) {
        const itemEnOrden = orden.items.find(i => i.id === productoId);
        if (itemEnOrden) {
          vendidos += itemEnOrden.quantity;
          if (orden.barraEntregada) entregados += itemEnOrden.quantity;
        }
      }
    });
    return { vendidos, entregados };
  };

  const agregarProducto = async () => {
    if (!prodNombre || !prodPrecio) return Alert.alert("Datos incompletos", "El nombre y el precio son obligatorios.");
    setLoading(true);
    try {
      await addDoc(collection(db, 'productosBarra'), { name: prodNombre, price: Number(prodPrecio), stock: prodStock === '' ? null : Number(prodStock), categoria: prodCategoria, createdAt: new Date() });
      setProdNombre(''); setProdPrecio(''); setProdStock('');
    } catch (e) {} setLoading(false);
  };
  const eliminarProducto = async (id) => {
    Alert.alert("Eliminar", "¿Borrar este producto del menú?", [{ text: "Cancelar", style: "cancel" }, { text: "Borrar", style: "destructive", onPress: async () => await deleteDoc(doc(db, 'productosBarra', id)) }]);
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

      {modo === 'escaner' && (
        <>
          <View style={styles.cameraContainer}>
            <CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : ({data}) => procesarCodigo(data)} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} />
            <View style={styles.overlay}><View style={styles.scanFrame} /></View>
          </View>

          <View style={styles.panel}>
            {!pedidoData && (
              <View style={styles.buscadorContainer}>
                <TextInput style={styles.inputBuscador} placeholder="ID (Ej: 145 192)" placeholderTextColor="#666" value={idBuscador} onChangeText={setIdBuscador} keyboardType="numeric" autoCapitalize="none" />
                <TouchableOpacity style={styles.btnBuscar} onPress={() => procesarCodigo(idBuscador)} disabled={loading}>
                  <Text style={{fontWeight: 'bold'}}>{loading ? '...' : 'Buscar'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {loading && <ActivityIndicator size="large" color="#deff9a" style={{marginTop:20}}/>}
            {!loading && !pedidoData && <Text style={styles.infoText}>Escaneá o tipeá el ID del pedido.</Text>}
            
            {!loading && pedidoData && (
              <View style={styles.resultCard}>
                <Text style={[styles.statusTitle, { color: pedidoData.yaEntregado ? '#ff4d4d' : '#deff9a' }]}>{pedidoData.yaEntregado ? '🔴 YA ENTREGADO' : '🟢 PENDIENTE'}</Text>
                <View style={styles.itemsList}>
                  {pedidoData.items.map((item, index) => <Text key={index} style={styles.itemText}>• <Text style={{ fontWeight: 'bold', color: '#fff' }}>{item.quantity}x</Text> {item.name}</Text>)}
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

      {modo === 'pedidos' && (
        <ScrollView style={styles.listaContainer} contentContainerStyle={{paddingBottom: 40}}>
          <View style={styles.manualForm}>
            <Text style={{ color: '#fff', marginBottom: 15, fontWeight: 'bold', fontSize: 18 }}>💵 Venta Efectivo en Barra</Text>
            {productos.map(item => {
              const qty = cartManual[item.id]?.quantity || 0;
              const isOutOfStock = item.stock !== null && item.stock <= 0;
              return (
                <View key={item.id} style={styles.cartRow}>
                  <View style={{flex: 1}}>
                    <Text style={{color: isOutOfStock ? '#666' : '#fff', fontWeight: 'bold'}}>{item.name} (${item.price})</Text>
                    {isOutOfStock && <Text style={{color: '#ff4d4d', fontSize: 12}}>Agotado</Text>}
                  </View>
                  <View style={styles.qtyControl}>
                    <TouchableOpacity onPress={() => updateCart(item, -1)} style={styles.qtyBtn} disabled={qty===0}><Text style={{color:'#fff'}}>-</Text></TouchableOpacity>
                    <Text style={{color:'#fff', width: 20, textAlign:'center'}}>{qty}</Text>
                    <TouchableOpacity onPress={() => updateCart(item, 1)} style={[styles.qtyBtn, {backgroundColor: isOutOfStock ? '#555' : '#333'}]} disabled={isOutOfStock}><Text style={{color:'#fff'}}>+</Text></TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, borderTopWidth: 1, borderTopColor: '#333', paddingTop: 15}}>
              <Text style={{color: '#aaa', fontSize: 16}}>Total:</Text>
              <Text style={{color: '#deff9a', fontSize: 20, fontWeight: 'bold'}}>${totalManual}</Text>
            </View>
            <TouchableOpacity style={[styles.btnManual, {opacity: totalManual > 0 ? 1 : 0.5}]} onPress={cobrarVentaManual} disabled={totalManual === 0 || loading}>
              <Text style={{ fontWeight: 'bold' }}>{loading ? 'Procesando...' : 'Cobrar en Efectivo'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>📊 Resumen de Artículos</Text>
          <View style={styles.resumenContainer}>
            {productos.map(prod => {
              const { vendidos, entregados } = calcularResumen(prod.id);
              return (
                <View key={prod.id} style={styles.resumenItem}>
                  <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 15, marginBottom: 5}}>{prod.name}</Text>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                    <Text style={{color: '#aaa', fontSize: 12}}>Vendidos: <Text style={{color:'#fff'}}>{vendidos}</Text></Text>
                    <Text style={{color: '#aaa', fontSize: 12}}>Entregados: <Text style={{color:'#deff9a'}}>{entregados}</Text></Text>
                    <Text style={{color: '#aaa', fontSize: 12}}>Stock: <Text style={{color:'#fff'}}>{prod.stock === null ? '∞' : prod.stock}</Text></Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>📝 Historial de Ventas</Text>
          {ventasBarra.map((orden) => (
            <View key={orden.id} style={styles.historialCard}>
              <View style={{flex: 1}}>
                <Text style={{color: '#fff', fontWeight: 'bold'}}>ID: {orden.id.substring(0,8)}... <Text style={{color: '#888', fontWeight:'normal'}}>({orden.isManual ? 'Efectivo' : 'MercadoPago'})</Text></Text>
                <Text style={{color: '#deff9a', marginTop: 3}}>${orden.total}</Text>
                <Text style={{color: '#aaa', fontSize: 12, marginTop: 3}}>Estado: {orden.barraEntregada ? 'Entregado' : 'Pendiente'}</Text>
              </View>
              <TouchableOpacity style={styles.btnListaBorrar} onPress={() => eliminarOrden(orden)}>
                <Text style={{color: '#fff'}}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {modo === 'stock' && (
        <View style={styles.listaContainer}>
          <View style={styles.manualForm}>
            <Text style={{ color: '#fff', marginBottom: 10, fontWeight: 'bold' }}>➕ Nuevo Producto al Menú</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity style={[styles.btnCat, prodCategoria === 'bebida' && styles.btnCatActive]} onPress={() => setProdCategoria('bebida')}><Text style={[styles.catText, prodCategoria === 'bebida' && { color: '#000' }]}>🍺 Bebida</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btnCat, prodCategoria === 'comida' && styles.btnCatActive]} onPress={() => setProdCategoria('comida')}><Text style={[styles.catText, prodCategoria === 'comida' && { color: '#000' }]}>🍔 Comida</Text></TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { marginBottom: 10 }]} placeholder="Nombre (ej. Cerveza IPA)" placeholderTextColor="#666" value={prodNombre} onChangeText={setProdNombre} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Precio $" placeholderTextColor="#666" keyboardType="numeric" value={prodPrecio} onChangeText={setProdPrecio} />
              <TextInput style={[styles.input, { flex: 1 }]} placeholder="Stock (Vacío=Inf)" placeholderTextColor="#666" keyboardType="numeric" value={prodStock} onChangeText={setProdStock} />
            </View>
            <TouchableOpacity style={styles.btnManual} onPress={agregarProducto} disabled={loading}><Text style={{ fontWeight: 'bold' }}>{loading ? 'Guardando...' : 'Agregar al Menú'}</Text></TouchableOpacity>
          </View>
          <Text style={styles.sectionTitle}>Productos Activos</Text>
          <FlatList data={productos} keyExtractor={(item) => item.id} renderItem={({ item }) => (
            <View style={styles.listItem}>
              <View><Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{item.categoria === 'comida' ? '🍔' : '🍺'} {item.name}</Text><Text style={{ color: '#888', fontSize: 13 }}>Precio: ${item.price} • Stock: {item.stock === null ? '∞' : item.stock}</Text></View>
              <TouchableOpacity onPress={() => eliminarProducto(item.id)}><Text style={{ color: '#ff4d4d', fontSize: 20 }}>🗑️</Text></TouchableOpacity>
            </View>
          )} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  tabs: { flexDirection: 'row', backgroundColor: '#1a1a1a' },
  tab: { flex: 1, padding: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#deff9a' },
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 13 },
  tabTextActive: { color: '#deff9a' },
  cameraContainer: { flex: 1.5, position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 220, height: 220, borderWidth: 2, borderColor: '#deff9a' },
  panel: { flex: 1.2, backgroundColor: '#1a1a1a', padding: 20 },
  infoText: { color: '#888', textAlign: 'center', fontSize: 14, marginTop: 15 },
  resultCard: { backgroundColor: '#000', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  statusTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  itemsList: { backgroundColor: '#111', padding: 12, borderRadius: 6, marginBottom: 15 },
  itemText: { color: '#ccc', fontSize: 16, paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  btnAccion: { flex: 1, padding: 15, borderRadius: 8, alignItems: 'center' },
  listaContainer: { flex: 1, padding: 15 },
  manualForm: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10, marginBottom: 20 },
  input: { backgroundColor: '#000', color: '#fff', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  btnManual: { backgroundColor: '#deff9a', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 15, borderRadius: 8, marginBottom: 8 },
  btnCat: { flex: 1, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  btnCatActive: { backgroundColor: '#deff9a', borderColor: '#deff9a' },
  catText: { color: '#fff', fontWeight: 'bold' },
  buscadorContainer: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  inputBuscador: { flex: 1, backgroundColor: '#000', color: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  btnBuscar: { backgroundColor: '#deff9a', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8 },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  qtyControl: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#000', borderRadius: 15, padding: 5 },
  qtyBtn: { width: 25, height: 25, borderRadius: 12.5, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { color: '#deff9a', marginVertical: 10, fontWeight: 'bold', fontSize: 18 },
  resumenContainer: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10, marginBottom: 20 },
  resumenItem: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#222', paddingBottom: 10 },
  historialCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 15, borderRadius: 8, marginBottom: 10 },
  btnListaBorrar: { backgroundColor: '#ff4d4d', padding: 10, borderRadius: 6 }
});