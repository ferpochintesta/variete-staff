import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, TextInput, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';

const LOGOS_DISPONIBLES = ['🎭', '🎸', '🎤', '🎪', '💃', '🤡', '🪄', '🥁', '🎨', '🔥', '🎵'];

export default function EventoScreen() {
  const [modo, setModo] = useState('grilla'); 
  const [loading, setLoading] = useState(false);
  const [modalFormVisible, setModalFormVisible] = useState(false); // Para el botón flotante

  // Estados Base de Datos
  const [artistas, setArtistas] = useState([]);
  const [grilla, setGrilla] = useState([]);
  const [categoriasUnicas, setCategoriasUnicas] = useState([]);
  
  // Reloj y Fecha
  const [fechaEvento, setFechaEvento] = useState(''); // Ej: "26/05/2026"
  const [inputFecha, setInputFecha] = useState('');
  const [horaActual, setHoraActual] = useState(new Date());

  // Estados Formulario Artistas
  const [artNombre, setArtNombre] = useState('');
  const [artDisciplina, setArtDisciplina] = useState('');
  const [artLogo, setArtLogo] = useState(LOGOS_DISPONIBLES[0]);

  // Estados Formulario Grilla
  const [gridHora, setGridHora] = useState('');
  const [gridNombre, setGridNombre] = useState('');
  const [gridCategoria, setGridCategoria] = useState('');
  const [gridArtistasSelect, setGridArtistasSelect] = useState([]); 
  const [isIntervalo, setIsIntervalo] = useState(false);

  useEffect(() => {
    // 1. Reloj que corre cada 1 minuto para actualizar la línea de tiempo
    const timer = setInterval(() => setHoraActual(new Date()), 60000);

    // 2. Traer Fecha del evento compartida
    const unsubMeta = onSnapshot(doc(db, 'metadata', 'evento'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().fecha) {
        setFechaEvento(docSnap.data().fecha);
        setInputFecha(docSnap.data().fecha);
      }
    });

    const unsubArtistas = onSnapshot(collection(db, 'artistas'), (snapshot) => {
      let lista = [];
      snapshot.forEach(d => lista.push({ id: d.id, ...d.data() }));
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setArtistas(lista);
    });

    const unsubGrilla = onSnapshot(collection(db, 'grilla'), (snapshot) => {
      let lista = [];
      let cats = new Set();
      snapshot.forEach(d => {
        const data = d.data();
        lista.push({ id: d.id, ...data });
        if (data.categoria) cats.add(data.categoria);
      });
      lista.sort((a, b) => a.hora.localeCompare(b.hora));
      setGrilla(lista);
      setCategoriasUnicas(Array.from(cats));
    });

    return () => { clearInterval(timer); unsubMeta(); unsubArtistas(); unsubGrilla(); };
  }, []);

  // --- LÓGICA DE TIEMPO (CRONOGRAMA VIVO) ---
  const guardarFechaEvento = async () => {
    if (!inputFecha.includes('/')) return Alert.alert("Formato", "Usá el formato DD/MM/YYYY (ej: 26/05/2026)");
    await setDoc(doc(db, 'metadata', 'evento'), { fecha: inputFecha }, { merge: true });
    Alert.alert("Actualizado", "Fecha del evento guardada para todo el staff.");
  };

  // Transforma "21:30" y la fecha en un objeto Date real para comparar
  const parseEventTime = (horaStr) => {
    if (!fechaEvento || !fechaEvento.includes('/')) return new Date();
    
    // Desglosamos la fecha (ej: "26/05/2026")
    const [day, month, year] = fechaEvento.split('/');
    // Desglosamos la hora (ej: "16:00")
    const [h, m] = horaStr.split(':');
    
    // Creamos la fecha localmente en Montevideo
    // Al usar Date(year, month-1, day, h, m), el navegador/celular 
    // lo interpreta según la zona horaria del sistema.
    const eventDate = new Date(year, month - 1, day, h, m);
    
    return eventDate;
  };

  // --- LÓGICA ARTISTAS ---
  const agregarArtista = async () => {
    if (!artNombre || !artDisciplina) return Alert.alert("Faltan datos", "Completá nombre y disciplina.");
    setLoading(true);
    try {
      await addDoc(collection(db, 'artistas'), { nombre: artNombre, disciplina: artDisciplina, logo: artLogo });
      setArtNombre(''); setArtDisciplina('');
    } catch (e) {} setLoading(false);
  };

  const eliminarArtista = (id) => {
    Alert.alert("Eliminar", "¿Borrar a este artista?", [{ text: "Cancelar", style: "cancel" }, { text: "Borrar", style: "destructive", onPress: async () => await deleteDoc(doc(db, 'artistas', id)) }]);
  };

  // --- LÓGICA GRILLA ---
  const toggleArtistaGrilla = (artistaId) => {
    setGridArtistasSelect(prev => prev.includes(artistaId) ? prev.filter(id => id !== artistaId) : [...prev, artistaId]);
  };

  const agregarEventoGrilla = async () => {
    if (!gridHora || !gridNombre) return Alert.alert("Faltan datos", "Hora y nombre son obligatorios.");
    setLoading(true);
    try {
      await addDoc(collection(db, 'grilla'), { hora: gridHora, nombre: gridNombre, categoria: gridCategoria, isIntervalo, artistasIds: isIntervalo ? [] : gridArtistasSelect });
      setGridHora(''); setGridNombre(''); setGridCategoria(''); setGridArtistasSelect([]); setIsIntervalo(false);
      setModalFormVisible(false); // Cierra el modal flotante
    } catch (e) {} setLoading(false);
  };

  const eliminarEventoGrilla = (id) => {
    Alert.alert("Eliminar", "¿Borrar este evento?", [{ text: "Cancelar", style: "cancel" }, { text: "Borrar", style: "destructive", onPress: async () => await deleteDoc(doc(db, 'grilla', id)) }]);
  };

  const getArtistasNombres = (idsArray) => {
    if (!idsArray || idsArray.length === 0) return '';
    return artistas.filter(a => idsArray.includes(a.id)).map(a => `${a.logo} ${a.nombre}`).join(' • ');
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, modo === 'grilla' && styles.tabActive]} onPress={() => setModo('grilla')}>
          <Text style={[styles.tabText, modo === 'grilla' && styles.tabTextActive]}>📅 Cronograma</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, modo === 'artistas' && styles.tabActive]} onPress={() => setModo('artistas')}>
          <Text style={[styles.tabText, modo === 'artistas' && styles.tabTextActive]}>🎭 Artistas</Text>
        </TouchableOpacity>
      </View>

      {modo === 'artistas' && (
        <View style={styles.content}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>➕ Nuevo Artista</Text>
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
              <TextInput style={[styles.input, {flex: 2}]} placeholder="Nombre..." placeholderTextColor="#666" value={artNombre} onChangeText={setArtNombre} />
              <TextInput style={[styles.input, {flex: 1.5}]} placeholder="Disciplina" placeholderTextColor="#666" value={artDisciplina} onChangeText={setArtDisciplina} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15, maxHeight: 50}}>
              {LOGOS_DISPONIBLES.map(logo => (
                <TouchableOpacity key={logo} onPress={() => setArtLogo(logo)} style={[styles.logoBtn, artLogo === logo && styles.logoBtnActive]}><Text style={{fontSize: 20}}>{logo}</Text></TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.btnGuardar} onPress={agregarArtista} disabled={loading}>
              <Text style={{fontWeight: 'bold'}}>Agregar Artista</Text>
            </TouchableOpacity>
          </View>
          <FlatList data={artistas} keyExtractor={i => i.id} renderItem={({item}) => (
            <View style={styles.listItem}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}><Text style={{fontSize: 24, marginRight: 10}}>{item.logo}</Text><View><Text style={{color: '#fff', fontSize: 16, fontWeight: 'bold'}}>{item.nombre}</Text><Text style={{color: '#888', fontSize: 13}}>{item.disciplina}</Text></View></View>
              <TouchableOpacity onPress={() => eliminarArtista(item.id)}><Text style={{color: '#ff4d4d', fontSize: 20}}>🗑️</Text></TouchableOpacity>
            </View>
          )} />
        </View>
      )}

      {modo === 'grilla' && (
        <View style={styles.content}>
          
          {/* Selector de Fecha */}
          <View style={styles.fechaContainer}>
            <Text style={{color: '#888', fontWeight: 'bold'}}>Fecha Evento:</Text>
            <TextInput style={styles.inputFecha} placeholder="DD/MM/YYYY" placeholderTextColor="#555" value={inputFecha} onChangeText={setInputFecha} />
            <TouchableOpacity style={styles.btnFecha} onPress={guardarFechaEvento}>
              <Text style={{color: '#000', fontWeight: 'bold', fontSize: 12}}>Guardar</Text>
            </TouchableOpacity>
          </View>

          {/* LISTA DEL CRONOGRAMA */}
          <FlatList 
            data={grilla} 
            keyExtractor={i => i.id} 
            contentContainerStyle={{paddingBottom: 80}} // Espacio para que el boton flotante no tape
            renderItem={({item, index}) => {
              // Cálculos para la línea de tiempo
              const thisTime = parseEventTime(item.hora);
              const nextTime = index < grilla.length - 1 ? parseEventTime(grilla[index+1].hora) : null;
              
              const isPast = nextTime ? horaActual >= nextTime : (horaActual.getTime() - thisTime.getTime() > 2 * 60 * 60 * 1000); // Pasado si ya empezó el siguiente, o si pasaron 2hs del último
              const isActive = horaActual >= thisTime && (!nextTime || horaActual < nextTime);

              return (
                <View style={[
                  styles.listItem, 
                  item.isIntervalo && {backgroundColor: '#111'},
                  isPast && { opacity: 0.4 }, // Se atenúa si ya pasó
                  isActive && { borderColor: '#deff9a', borderWidth: 2, transform: [{scale: 1.02}] } // Se ilumina si es AHORA
                ]}>
                  <View style={{flex: 1}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 2}}>
                      <Text style={{color: isActive ? '#deff9a' : '#fff', fontWeight: 'bold', fontSize: 16, marginRight: 10}}>{item.hora}</Text>
                      {item.categoria ? <Text style={{color: '#888', fontSize: 11, backgroundColor: '#222', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4}}>{item.categoria.toUpperCase()}</Text> : null}
                      {isActive && <Text style={{color: '#000', backgroundColor: '#deff9a', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 5, borderRadius: 4, marginLeft: 10}}>📍 AHORA</Text>}
                    </View>
                    <Text style={{color: item.isIntervalo ? '#aaa' : '#fff', fontSize: 16, fontWeight: 'bold'}}>{item.nombre} {item.isIntervalo && '☕'}</Text>
                    {!item.isIntervalo && <Text style={{color: '#ccc', fontSize: 13, marginTop: 4}}>{getArtistasNombres(item.artistasIds)}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => eliminarEventoGrilla(item.id)}><Text style={{color: '#ff4d4d', fontSize: 20, paddingLeft: 10}}>🗑️</Text></TouchableOpacity>
                </View>
              );
            }} 
          />

          {/* BOTÓN FLOTANTE (FAB) */}
          <TouchableOpacity style={styles.fab} onPress={() => setModalFormVisible(true)}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>

          {/* MODAL PARA NUEVO EVENTO */}
          <Modal visible={modalFormVisible} transparent={true} animationType="slide">
            <View style={styles.modalBg}>
              <ScrollView style={styles.formCardModal} nestedScrollEnabled={true}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15}}>
                  <Text style={styles.formTitle}>🕒 Agregar a la Grilla</Text>
                  <TouchableOpacity onPress={() => setModalFormVisible(false)}><Text style={{color: '#ff4d4d', fontSize: 18, fontWeight: 'bold'}}>X</Text></TouchableOpacity>
                </View>
                
                <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}>
                  <TextInput style={[styles.input, {flex: 1}]} placeholder="Hora (21:30)" placeholderTextColor="#666" value={gridHora} onChangeText={setGridHora} />
                  <TextInput style={[styles.input, {flex: 2}]} placeholder="Nombre (Ej: Show)" placeholderTextColor="#666" value={gridNombre} onChangeText={setGridNombre} />
                </View>

                <TextInput style={[styles.input, {marginBottom: 5}]} placeholder="Categoría (escribir crea una nueva)" placeholderTextColor="#666" value={gridCategoria} onChangeText={setGridCategoria} />
                
                {categoriasUnicas.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 15, maxHeight: 40}}>
                    {categoriasUnicas.map(cat => <TouchableOpacity key={cat} style={styles.chipCat} onPress={() => setGridCategoria(cat)}><Text style={{color: '#aaa', fontSize: 12}}>{cat}</Text></TouchableOpacity>)}
                  </ScrollView>
                )}

                <TouchableOpacity style={styles.intervaloToggle} onPress={() => setIsIntervalo(!isIntervalo)}>
                  <Text style={{color: '#fff'}}>¿Es un intervalo / receso? </Text>
                  <Text style={{color: isIntervalo ? '#deff9a' : '#888', fontWeight: 'bold'}}>{isIntervalo ? '✅ SÍ' : '❌ NO'}</Text>
                </TouchableOpacity>

                {!isIntervalo && (
                  <View style={{marginTop: 10, marginBottom: 15}}>
                    <Text style={{color: '#888', marginBottom: 5, fontSize: 12}}>Seleccioná los artistas:</Text>
                    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                      {artistas.map(art => {
                        const selected = gridArtistasSelect.includes(art.id);
                        return (
                          <TouchableOpacity key={art.id} onPress={() => toggleArtistaGrilla(art.id)} style={[styles.chipArtista, selected && styles.chipArtistaActive]}>
                            <Text style={{color: selected ? '#000' : '#ccc', fontWeight: selected ? 'bold' : 'normal', fontSize: 13}}>{art.logo} {art.nombre}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                )}

                <TouchableOpacity style={[styles.btnGuardar, {marginBottom: 40}]} onPress={agregarEventoGrilla} disabled={loading}>
                  <Text style={{fontWeight: 'bold', fontSize: 16}}>{loading ? '...' : 'Guardar Evento'}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </Modal>

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
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 14 },
  tabTextActive: { color: '#deff9a' },
  content: { flex: 1, padding: 15 },
  // Fecha
  fechaContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 10, borderRadius: 8, marginBottom: 15, justifyContent: 'space-between' },
  inputFecha: { color: '#fff', backgroundColor: '#000', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 5, borderWidth: 1, borderColor: '#333', textAlign: 'center', width: 120 },
  btnFecha: { backgroundColor: '#deff9a', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 5 },
  // FAB (Botón Flotante)
  fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, backgroundColor: '#deff9a', borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.8, shadowRadius: 2, borderWidth: 2, borderColor: '#000' },
  fabText: { fontSize: 35, color: '#000', fontWeight: 'bold', marginTop: -2 },
  // Modal Formularios
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  formCardModal: { backgroundColor: '#1a1a1a', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  // Estilos Generales
  formCard: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10, marginBottom: 15 },
  formTitle: { color: '#fff', marginBottom: 5, fontWeight: 'bold', fontSize: 18 },
  input: { backgroundColor: '#000', color: '#fff', padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
  btnGuardar: { backgroundColor: '#deff9a', padding: 12, borderRadius: 6, alignItems: 'center', marginTop: 5 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 15, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' },
  logoBtn: { padding: 10, backgroundColor: '#000', borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: '#333' },
  logoBtnActive: { borderColor: '#deff9a', backgroundColor: '#333' },
  chipCat: { backgroundColor: '#222', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, marginRight: 8, borderWidth: 1, borderColor: '#444' },
  intervaloToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#333', marginTop: 5 },
  chipArtista: { backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#444' },
  chipArtistaActive: { backgroundColor: '#deff9a', borderColor: '#deff9a' }
});