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
                      type="button"
                      onClick={() => setTicketActivo(null)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Nuevo pedido
                    </button>
                  </div>

                  <div className="text-center my-4">
                    <p className="text-xs text-slate-500">Muestra este código en barra (Sin papel)</p>
                    <p className="text-4xl font-black tracking-wider text-blue-900 my-1">
                      {ticketActivo.codigo_turno}
                    </p>
                    <p className="text-sm font-medium">{ticketActivo.estudiante_nombre}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Pago: <strong className="text-slate-800">{ticketActivo.metodo_pago}</strong>
                    </p>

                    <div className="mt-3 inline-block px-3 py-1 rounded-full text-xs font-bold uppercase bg-amber-100 text-amber-900">
                      {ticketActivo.estado === 'pendiente_pago' && '⏳ Pasa a pagar / en cola'}
                      {ticketActivo.estado === 'listo_retirar' && '✅ ¡Listo para retirar en barra!'}
                      {ticketActivo.estado === 'entregado' && '🎉 Entregado (Ticket usado)'}
                    </div>
                  </div>

                  <div className="border-t pt-3 space-y-1.5 text-sm">
                    {ticketActivo.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span>
                          {item.cantidad}x {item.nombre_producto}{' '}
                          {item.calentar && (
                            <span className="text-xs bg-orange-100 text-orange-800 font-bold px-1.5 py-0.5 rounded">
                              🔥 Calentar
                            </span>
                          )}
                        </span>
                        <span className="font-semibold">RD$ {item.subtotal}</span>
                      </div>
                    ))}
                    <div className="border-t pt-2 flex justify-between font-bold text-base">
                      <span>Total:</span>
                      <span>RD$ {ticketActivo.total}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                <h2 className="font-bold text-lg mb-3">Tu Orden Rápida</h2>

                {carrito.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    Selecciona lo que deseas de la vitrina para generar tu ticket sin hacer fila.
                  </p>
                ) : (
                  <form onSubmit={confirmarPedido} className="space-y-4">
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {carrito.map((item) => (
                        <div key={item.id} className="p-3 bg-slate-50 rounded-lg border text-sm">
                          <div className="flex justify-between font-semibold">
                            <span>
                              {item.cantidad}x {item.nombre}
                            </span>
                            <button
                              type="button"
                              onClick={() => quitarDelCarrito(item.id)}
                              className="text-red-500 text-xs hover:underline"
                            >
                              Quitar
                            </button>
                          </div>

                          <div className="flex justify-between items-center mt-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-orange-800 bg-orange-50 px-2 py-1 rounded border border-orange-200">
                              <input
                                type="checkbox"
                                checked={item.calentar}
                                onChange={() => toggleCalentar(item.id)}
                                className="accent-orange-600"
                              />
                              🔥 Pedir caliente (Microondas)
                            </label>
                            <span className="font-bold">RD$ {item.precio * item.cantidad}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-3 flex justify-between font-bold text-lg">
                      <span>Total a pagar:</span>
                      <span className="text-blue-900">RD$ {totalCarrito}</span>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="text"
                        required
                        placeholder="Tu nombre"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Matrícula (opcional)"
                        value={matricula}
                        onChange={(e) => setMatricula(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Método de pago
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {['Efectivo', 'Tarjeta', 'Transferencia'].map((metodo) => (
                            <button
                              key={metodo}
                              type="button"
                              onClick={() => setMetodoPago(metodo)}
                              className={`py-2 px-2 rounded-lg text-xs font-bold border transition ${
                                metodoPago === metodo
                                  ? 'bg-blue-900 text-white border-blue-900'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {metodo === 'Efectivo' && '💵 Efectivo'}
                              {metodo === 'Tarjeta' && '💳 Tarjeta'}
                              {metodo === 'Transferencia' && '📲 Transf.'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={cargando}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow transition"
                    >
                      {cargando ? 'Generando ticket...' : 'Generar Ticket Digital'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <h2 className="font-bold text-lg mb-1">Control de Vitrina (Hay / No hay)</h2>
              <p className="text-xs text-slate-500 mb-4">
                Actualiza la disponibilidad al instante para que los estudiantes no hagan fila por gusto.
              </p>

              <div className="space-y-2.5">
                {productos.map((prod) => (
                  <div
                    key={prod.id}
                    className="flex items-center justify-between p-3 rounded-xl border bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold text-sm">{prod.nombre}</p>
                      <p className="text-xs text-slate-500">
                        Stock actual: <strong className="text-slate-800">{prod.stock_actual}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => actualizarStock(prod.id, prod.stock_actual - 1)}
                        className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 font-bold"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => actualizarStock(prod.id, prod.stock_actual + 1)}
                        className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 hover:bg-blue-200 font-bold"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => actualizarStock(prod.id, 0)}
                        className="px-2.5 h-8 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-bold ml-1"
                      >
                        Agotar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <h2 className="font-bold text-lg mb-1">Tickets Activos en Barra</h2>
              <p className="text-xs text-slate-500 mb-4">
                Valida el código digital, revisa el método de pago y marca como entregado.
              </p>

              {ticketsBarra.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">
                  No hay tickets pendientes en este momento.
                </p>
              ) : (
                <div className="space-y-3">
                  {ticketsBarra.map((ticket) => (
                    <div key={ticket.id} className="p-4 rounded-xl border-2 border-slate-200 bg-slate-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-lg font-black text-blue-900">{ticket.codigo_turno}</span>
                          <p className="text-sm font-semibold">{ticket.estudiante_nombre}</p>
                          <span className="inline-block mt-1 text-xs font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded">
                            Pago: {ticket.metodo_pago || 'Efectivo'}
                          </span>
                        </div>
                        <span className="font-bold text-sm bg-white px-2.5 py-1 rounded border">
                          RD$ {ticket.total}
                        </span>
                      </div>

                      <div className="my-3 space-y-1 bg-white p-2.5 rounded-lg border text-sm">
                        {ticket.ticket_items?.map((item) => (
                          <div key={item.id} className="flex justify-between items-center">
                            <span>
                              <strong>{item.cantidad}x</strong> {item.nombre_producto}
                            </span>
                            {item.calentar ? (
                              <span className="text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded">
                                🔥 CALENTAR
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Tal cual</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        {ticket.estado === 'pendiente_pago' && (
                          <button
                            type="button"
                            onClick={() => cambiarEstadoTicket(ticket.id, 'listo_retirar')}
                            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg text-xs"
                          >
                            1. Cobrado / Listo en Barra
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => cambiarEstadoTicket(ticket.id, 'entregado')}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-xs"
                        >
                          ✓ Entregado (Cerrar Ticket)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
