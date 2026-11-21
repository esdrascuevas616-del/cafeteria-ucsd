'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function CafeteriaUCSD() {
  const [vista, setVista] = useState('estudiante');
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [nombre, setNombre] = useState('');
  const [matricula, setMatricula] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [ticketActivo, setTicketActivo] = useState(null);
  const [ticketsBarra, setTicketsBarra] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState('');

  useEffect(() => {
    cargarProductos();
    cargarTickets();

    let canal = null;
    try {
      canal = supabase
        .channel('cafeteria-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => {
          cargarProductos();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
          cargarTickets();
          if (ticketActivo && payload.new?.id === ticketActivo.id) {
            setTicketActivo((prev) => ({ ...prev, ...payload.new }));
          }
        })
        .subscribe();
    } catch (err) {
      console.error('Error Realtime:', err);
    }

    return () => {
      if (canal) {
        supabase.removeChannel(canal);
      }
    };
  }, [ticketActivo?.id]);

  async function cargarProductos() {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('categoria', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) {
      setMensajeError('Revisa la conexión con Supabase y las tablas SQL.');
      return;
    }
    setMensajeError('');
    if (data) setProductos(data);
  }

  async function cargarTickets() {
    const { data, error } = await supabase
      .from('tickets')
      .select('*, ticket_items(*)')
      .neq('estado', 'entregado')
      .order('created_at', { ascending: true });

    if (!error && data) {
      setTicketsBarra(data);
    }
  }

  function agregarAlCarrito(prod) {
    if (!prod.disponible || prod.stock_actual <= 0) return;
    setCarrito((prev) => {
      const existe = prev.find((item) => item.id === prod.id);
      if (existe) {
        if (existe.cantidad >= prod.stock_actual) return prev;
        return prev.map((item) =>
          item.id === prod.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      }
      return [...prev, { ...prod, cantidad: 1, calentar: false }];
    });
  }

  function toggleCalentar(id) {
    setCarrito((prev) =>
      prev.map((item) => (item.id === id ? { ...item, calentar: !item.calentar } : item))
    );
  }

  function quitarDelCarrito(id) {
    setCarrito((prev) => prev.filter((item) => item.id !== id));
  }

  const totalCarrito = carrito.reduce((acc, item) => acc + item.precio * item.cantidad, 0);

  async function confirmarPedido(e) {
    e.preventDefault();
    if (carrito.length === 0 || !nombre.trim()) return;
    setCargando(true);
    setMensajeError('');

    const numeroAleatorio = Math.floor(100 + Math.random() * 900);
    const codigoTurno = `UCSD-${numeroAleatorio}`;

    const { data: nuevoTicket, error } = await supabase
      .from('tickets')
      .insert({
        codigo_turno: codigoTurno,
        estudiante_nombre: nombre.trim(),
        matricula: matricula.trim() || 'N/A',
        metodo_pago: metodoPago,
        estado: 'pendiente_pago',
        total: totalCarrito,
      })
      .select()
      .single();

    if (error || !nuevoTicket) {
      setMensajeError('No se pudo generar el ticket: ' + (error?.message || 'Error desconocido'));
      setCargando(false);
      return;
    }

    const itemsInsertar = carrito.map((item) => ({
      ticket_id: nuevoTicket.id,
      producto_id: item.id,
      nombre_producto: item.nombre,
      cantidad: item.cantidad,
      calentar: item.calentar,
      subtotal: item.precio * item.cantidad,
    }));

    const { error: errorItems } = await supabase.from('ticket_items').insert(itemsInsertar);

    if (errorItems) {
      setMensajeError('El ticket se creó, pero hubo un detalle al guardar los productos.');
      setCargando(false);
      return;
    }

    setTicketActivo({ ...nuevoTicket, items: itemsInsertar });
    setCarrito([]);
    await cargarProductos();
    await cargarTickets();
    setCargando(false);
  }

  async function actualizarStock(id, nuevoStock) {
    const stockFinal = Math.max(0, Number(nuevoStock) || 0);
    await supabase.from('productos').update({ stock_actual: stockFinal }).eq('id', id);
    await cargarProductos();
  }

  async function cambiarEstadoTicket(id, nuevoEstado) {
    await supabase.from('tickets').update({ estado: nuevoEstado }).eq('id', id);
    await cargarTickets();
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans">
      <header className="bg-blue-900 text-white px-6 py-4 shadow-md flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Cafetería UCSD • Vitrina Digital</h1>
          <p className="text-xs text-blue-200">Consulta disponibilidad en vivo y retira sin hacer doble fila</p>
        </div>

        <div className="flex bg-blue-950 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setVista('estudiante')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              vista === 'estudiante' ? 'bg-white text-blue-900 shadow' : 'text-blue-200 hover:text-white'
            }`}
          >
            Vista Estudiante
          </button>
          <button
            type="button"
            onClick={() => setVista('barra')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              vista === 'barra' ? 'bg-amber-400 text-slate-900 shadow' : 'text-blue-200 hover:text-white'
            }`}
          >
            Panel Barra / Despacho ({ticketsBarra.length})
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {mensajeError && (
          <div className="mb-4 p-3 rounded-xl bg-red-100 border border-red-300 text-red-800 text-sm font-medium">
            {mensajeError}
          </div>
        )}

        {vista === 'estudiante' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-800">¿Qué hay ahora mismo en vitrina?</h2>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-medium">
                  ● En vivo
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {productos.map((prod) => (
                  <div
                    key={prod.id}
                    className={`p-4 rounded-xl border bg-white shadow-sm flex flex-col justify-between transition ${
                      !prod.disponible ? 'opacity-60 border-red-200 bg-slate-50' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {prod.categoria}
                        </span>
                        {prod.disponible ? (
                          <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                            Hay ({prod.stock_actual})
                          </span>
                        ) : (
                          <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            Agotado
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-base mt-1">{prod.nombre}</h3>
                      <p className="text-blue-900 font-extrabold text-lg mt-1">RD$ {prod.precio}</p>
                    </div>

                    <button
                      type="button"
                      disabled={!prod.disponible}
                      onClick={() => agregarAlCarrito(prod)}
                      className={`mt-4 w-full py-2 rounded-lg font-semibold text-sm transition ${
                        prod.disponible
                          ? 'bg-blue-900 text-white hover:bg-blue-800 active:scale-95'
                          : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {prod.disponible ? '+ Agregar al ticket' : 'No disponible'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {ticketActivo && (
                <div className="bg-white border-2 border-blue-900 rounded-2xl p-5 shadow-lg">
                  <div className="flex justify-between items-center border-b pb-3">
                    <span className="text-xs font-bold uppercase text-blue-900">Ticket Digital UCSD</span>
                    <button
