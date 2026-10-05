import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { StatusBar } from 'expo-status-bar'
import * as WebBrowser from 'expo-web-browser'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { SvgUri } from 'react-native-svg'
import {
  ArrowLeft, ArrowRight, Check, CircleUserRound, Clock3, Home, Minus, PackageCheck,
  Plus, RefreshCw, ShoppingBag, Sparkles, Trash2, Wifi, WifiOff,
} from 'lucide-react-native'
import { useFonts as useFredoka, Fredoka_500Medium, Fredoka_600SemiBold } from '@expo-google-fonts/fredoka'
import { useFonts as useNunito, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito'
import {
  connectCartChannel, getCart, getCurrentUser, getProducts, productImageUrl, restoreSession,
  signInWithGoogle, signOut, submitOrder, syncCart,
} from './src/api'
import { colors, shadows, type } from './src/theme'

WebBrowser.maybeCompleteAuthSession()

const CART_KEY = 'crumb-and-bloom-mobile-cart'
const timeOptions = ['09:00', '10:00', '11:00', '12:00', '14:00', '16:00']
const formatNaira = (value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value)
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const cartsEqual = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => a[key] === b[key])
function mergeCarts(a, b) {
  const merged = { ...a }
  for (const [id, quantity] of Object.entries(b)) merged[id] = Math.max(merged[id] || 0, quantity)
  return merged
}

function LogoMark({ size = 34 }) {
  const petal = { width: size * 0.5, height: size * 0.58, borderRadius: size, borderWidth: 2, borderColor: colors.ink }
  return <View style={{ width: size, height: size }} accessible={false}>
    <View style={[petal, styles.logoPetal, { left: 1, bottom: 1, transform: [{ rotate: '-28deg' }] }]} />
    <View style={[petal, styles.logoPetal, { right: 1, bottom: 1, transform: [{ rotate: '28deg' }] }]} />
    <View style={[petal, styles.logoPetal, { left: size * 0.25, top: 0, backgroundColor: colors.berry }]} />
  </View>
}

function Brand() {
  return <View style={styles.brand} accessibilityLabel="Crumb and Bloom"><LogoMark /><Text style={styles.brandText}>Crumb <Text style={{ color: colors.berry }}>&</Text> Bloom</Text></View>
}

function IconButton({ label, onPress, children }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>{children}</Pressable>
}

function TopBar({ cartCount, onCart }) {
  return <View style={styles.topBar}>
    <Brand />
    <Pressable accessibilityRole="button" accessibilityLabel={`Open basket with ${cartCount} treats`} onPress={onCart} style={({ pressed }) => [styles.basketPill, pressed && styles.pressed]}>
      <ShoppingBag size={19} color={colors.white} /><Text style={styles.basketPillText}>{cartCount}</Text>
    </Pressable>
  </View>
}

function SyncBadge({ user, status }) {
  if (!user) return <View style={styles.syncBadgeMuted}><WifiOff size={13} color={colors.muted} /><Text style={styles.syncBadgeMutedText}>Sign in to sync</Text></View>
  const live = status === 'live'
  return <View style={[styles.syncBadgeMuted, live && styles.syncBadgeLive]}>
    {live ? <Wifi size={13} color={colors.success} /> : <RefreshCw size={13} color={colors.cobalt} />}
    <Text style={[styles.syncBadgeMutedText, live && { color: colors.success }]}>{live ? 'Basket live' : 'Connecting'}</Text>
  </View>
}

function QuantityControl({ name, quantity, onChange, compact = false }) {
  return <View style={[styles.quantity, compact && styles.quantityCompact]} accessibilityLabel={`${name} quantity ${quantity}`}>
    <Pressable accessibilityLabel={`Remove one ${name}`} hitSlop={6} onPress={() => onChange(quantity - 1)} style={styles.quantityButton}><Minus size={compact ? 15 : 17} color={colors.ink} /></Pressable>
    <Text style={styles.quantityText}>{quantity}</Text>
    <Pressable accessibilityLabel={`Add one ${name}`} hitSlop={6} onPress={() => onChange(quantity + 1)} style={styles.quantityButton}><Plus size={compact ? 15 : 17} color={colors.ink} /></Pressable>
  </View>
}

function ProductCard({ product, quantity, onChange }) {
  return <View style={styles.productCell}><View style={styles.productCard}>
    <View style={[styles.productArt, { backgroundColor: `${product.color}25` }]}>
      <Text numberOfLines={1} style={styles.productBadge}>{product.badge}</Text>
      <SvgUri accessibilityLabel={product.name} width="94%" height="128" uri={productImageUrl(product.image)} />
    </View>
    <View style={styles.productInfo}>
      <Text numberOfLines={2} style={styles.productName}>{product.name}</Text>
      <Text style={styles.productPrice}>{formatNaira(product.price)}</Text>
      <Text numberOfLines={2} style={styles.productDescription}>{product.description}</Text>
      {quantity ? <QuantityControl name={product.name} quantity={quantity} onChange={(next) => onChange(product.id, next)} compact /> :
        <Pressable accessibilityRole="button" accessibilityLabel={`Add ${product.name} to basket`} onPress={() => onChange(product.id, 1)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Text style={styles.addButtonText}>Add to box</Text><Plus size={16} color={colors.white} />
        </Pressable>}
    </View>
  </View></View>
}

function Hero({ user, syncStatus, onMenu }) {
  return <View style={styles.hero}>
    <View style={styles.heroDecorationOne} /><View style={styles.heroDecorationTwo} />
    <SyncBadge user={user} status={syncStatus} />
    <View style={styles.eyebrowRow}><Sparkles size={15} color={colors.berryDark} /><Text style={styles.eyebrow}>SMALL BATCH · BIG DELIGHT</Text></View>
    <Text style={styles.heroTitle}>Joy, baked{`\n`}fresh <Text style={{ color: colors.berry }}>daily.</Text></Text>
    <Text style={styles.heroCopy}>Handmade in Lagos, ready from 8am. Your favourite pastry box now fits in your pocket.</Text>
    <Pressable onPress={onMenu} style={({ pressed }) => [styles.primaryButton, { alignSelf: 'flex-start' }, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Choose your treats</Text><ArrowRight size={18} color={colors.white} /></Pressable>
    <View style={styles.heroTicket}><Text style={styles.ticketKicker}>TODAY'S LITTLE JOYS</Text><Text style={styles.ticketTitle}>6 delicious reasons</Text><Text style={styles.ticketFoot}>BAKED THIS MORNING</Text></View>
  </View>
}

function HomeScreen({ products, cart, user, syncStatus, category, setCategory, onChange }) {
  const listRef = useRef(null)
  const categories = useMemo(() => ['All treats', ...new Set(products.map((item) => item.category))], [products])
  const visible = category === 'All treats' ? products : products.filter((item) => item.category === category)
  return <FlatList
    ref={listRef} data={visible} keyExtractor={(item) => item.id} numColumns={2} showsVerticalScrollIndicator={false}
    contentContainerStyle={styles.homeContent} columnWrapperStyle={styles.productRow}
    ListHeaderComponent={<>
      <Hero user={user} syncStatus={syncStatus} onMenu={() => listRef.current?.scrollToOffset({ offset: 430, animated: true })} />
      <View style={styles.sectionIntro}><Text style={styles.kicker}>AT THE COUNTER</Text><Text style={styles.sectionTitle}>Pick your pleasure.</Text><Text style={styles.sectionCopy}>Small runs, fresh every morning. When today's batch is gone, tomorrow gets its turn.</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, category === item && styles.categoryChipActive]}><Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text></Pressable>)}</ScrollView>
    </>}
    ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyTitle}>The counter is resting.</Text><Text style={styles.emptyCopy}>Try again when the shop server is available.</Text></View>}
    renderItem={({ item }) => <ProductCard product={item} quantity={cart[item.id] || 0} onChange={onChange} />}
  />
}

function CartScreen({ products, cart, onChange, onCheckout, onBack }) {
  const items = products.filter((product) => cart[product.id])
  const subtotal = items.reduce((sum, product) => sum + product.price * cart[product.id], 0)
  return <ScrollView contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
    <View style={styles.screenHeadingRow}><IconButton label="Back to menu" onPress={onBack}><ArrowLeft size={21} color={colors.ink} /></IconButton><View style={{ flex: 1 }}><Text style={styles.kicker}>YOUR BAKERY BOX</Text><Text style={styles.screenTitle}>Good choices.</Text></View></View>
    {!items.length ? <View style={styles.emptyState}><View style={styles.emptyIcon}><ShoppingBag size={30} color={colors.berry} /></View><Text style={styles.emptyTitle}>Your box is waiting.</Text><Text style={styles.emptyCopy}>Add a pastry—or six. We support that decision.</Text><Pressable onPress={onBack} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Browse today's counter</Text></Pressable></View> : <>
      <View style={styles.cartList}>{items.map((product) => <View key={product.id} style={styles.cartItem}>
        <View style={[styles.cartThumb, { backgroundColor: `${product.color}25` }]}><SvgUri accessible={false} width="82" height="72" uri={productImageUrl(product.image)} /></View>
        <View style={styles.cartItemInfo}><Text style={styles.cartItemName}>{product.name}</Text><Text style={styles.cartItemPrice}>{formatNaira(product.price)}</Text><QuantityControl compact name={product.name} quantity={cart[product.id]} onChange={(next) => onChange(product.id, next)} /></View>
        <IconButton label={`Remove ${product.name}`} onPress={() => onChange(product.id, 0)}><Trash2 size={17} color={colors.berryDark} /></IconButton>
      </View>)}</View>
      <View style={styles.summaryCard}><View style={styles.summaryLine}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryTotal}>{formatNaira(subtotal)}</Text></View><Text style={styles.summaryHint}>Delivery is calculated at checkout.</Text><Pressable onPress={onCheckout} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Continue to checkout</Text><ArrowRight size={18} color={colors.white} /></Pressable></View>
    </>}
  </ScrollView>
}

function Field({ label, value, onChangeText, error, inputStyle, ...props }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholderTextColor="#978B90" style={[styles.input, inputStyle, error && styles.inputError]} accessibilityLabel={label} {...props} />{error ? <Text style={styles.errorText}>{error}</Text> : null}</View>
}

function CheckoutScreen({ products, cart, user, onBack, onComplete }) {
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', phone: '', fulfillment: 'delivery', address: '', date: tomorrow(), time: '10:00', notes: '', payment: 'on-delivery' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const items = products.filter((product) => cart[product.id])
  const subtotal = items.reduce((sum, product) => sum + product.price * cart[product.id], 0)
  const deliveryFee = form.fulfillment === 'delivery' ? 2500 : 0
  const total = subtotal + deliveryFee
  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: '' })) }
  async function placeOrder() {
    const next = {}
    if (!form.name.trim()) next.name = 'Enter the name for this order.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address.'
    if (!/^[+\d][\d\s()-]{8,}$/.test(form.phone)) next.phone = 'Enter a valid phone number.'
    if (form.fulfillment === 'delivery' && !form.address.trim()) next.address = 'Enter a delivery address.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) next.date = 'Use YYYY-MM-DD.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSubmitting(true); setServerError('')
    try {
      const result = await submitOrder({ customer: form, items: items.map((product) => ({ product_id: product.id, quantity: cart[product.id] })) })
      onComplete({ ...result, email: form.email, fulfillment: form.fulfillment, date: form.date, time: form.time })
    } catch (error) { setServerError(error.message) } finally { setSubmitting(false) }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={styles.screenHeadingRow}><IconButton label="Back to basket" onPress={onBack}><ArrowLeft size={21} color={colors.ink} /></IconButton><View style={{ flex: 1 }}><Text style={styles.kicker}>ALMOST YOURS</Text><Text style={styles.screenTitle}>Where should the joy go?</Text></View></View>
    <View style={styles.formCard}><Text style={styles.formSectionTitle}>1 · Contact</Text><Field label="Full name" value={form.name} onChangeText={(value) => update('name', value)} error={errors.name} autoComplete="name" /><Field label="Email address" value={form.email} onChangeText={(value) => update('email', value)} error={errors.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" /><Field label="Phone number" value={form.phone} onChangeText={(value) => update('phone', value)} error={errors.phone} keyboardType="phone-pad" placeholder="+234 801 234 5678" /></View>
    <View style={styles.formCard}><Text style={styles.formSectionTitle}>2 · Get your order</Text><View style={styles.choiceRow}>{['delivery', 'pickup'].map((choice) => <Pressable key={choice} onPress={() => update('fulfillment', choice)} style={[styles.choiceCard, form.fulfillment === choice && styles.choiceCardActive]}>{choice === 'delivery' ? <PackageCheck size={21} color={form.fulfillment === choice ? colors.white : colors.ink} /> : <ShoppingBag size={21} color={form.fulfillment === choice ? colors.white : colors.ink} />}<Text style={[styles.choiceTitle, form.fulfillment === choice && { color: colors.white }]}>{choice === 'delivery' ? 'Delivery' : 'Pick up'}</Text><Text style={[styles.choiceHint, form.fulfillment === choice && { color: '#F7D7DF' }]}>{choice === 'delivery' ? formatNaira(2500) : 'Free'}</Text></Pressable>)}</View>
      {form.fulfillment === 'delivery' && <Field label="Delivery address" value={form.address} onChangeText={(value) => update('address', value)} error={errors.address} placeholder="House number, street and area" />}
      <Field label="Date" value={form.date} onChangeText={(value) => update('date', value)} error={errors.date} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /><Text style={styles.fieldLabel}>Time</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeRow}>{timeOptions.map((time) => <Pressable key={time} onPress={() => update('time', time)} style={[styles.timeChip, form.time === time && styles.timeChipActive]}><Text style={[styles.timeText, form.time === time && { color: colors.white }]}>{time}</Text></Pressable>)}</ScrollView>
    </View>
    <View style={styles.formCard}><Text style={styles.formSectionTitle}>3 · Final details</Text><Field label="Note for the kitchen · optional" value={form.notes} onChangeText={(value) => update('notes', value)} multiline numberOfLines={4} maxLength={250} placeholder="Allergies, a birthday message, or anything we should know" inputStyle={styles.textarea} /><View style={styles.paymentNote}><Check size={18} color={colors.success} /><View style={{ flex: 1 }}><Text style={styles.paymentTitle}>Pay when you receive your order</Text><Text style={styles.paymentCopy}>Card and bank transfer are accepted at pickup or delivery.</Text></View></View></View>
    <View style={styles.checkoutTotal}><Text style={styles.summaryLabel}>Order total</Text><Text style={styles.summaryTotal}>{formatNaira(total)}</Text></View>{serverError ? <Text style={styles.formAlert}>{serverError}</Text> : null}<Pressable disabled={submitting} onPress={placeOrder} style={[styles.primaryButton, submitting && { opacity: 0.65 }]}>{submitting ? <ActivityIndicator color={colors.white} /> : <><Text style={styles.primaryButtonText}>Place order · {formatNaira(total)}</Text><ArrowRight size={18} color={colors.white} /></>}</Pressable>
  </ScrollView></KeyboardAvoidingView>
}

function AccountScreen({ user, syncStatus, onSignIn, onSignOut, busy }) {
  return <ScrollView contentContainerStyle={styles.screenContent}><Text style={styles.kicker}>YOUR ACCOUNT</Text><Text style={styles.screenTitle}>{user ? `Hi, ${user.name?.split(' ')[0]}.` : 'Keep your box close.'}</Text><Text style={styles.sectionCopy}>{user ? 'Your web and mobile baskets share one live Supabase cart.' : 'Sign in with the same Google account on web and mobile to keep your pastry box in sync.'}</Text>
    <View style={styles.accountCard}><View style={styles.avatarCircle}><CircleUserRound size={34} color={colors.cobalt} /></View>{user ? <><Text style={styles.accountName}>{user.name}</Text><Text style={styles.accountEmail}>{user.email}</Text><SyncBadge user={user} status={syncStatus} /></> : <><Text style={styles.accountName}>Guest baker</Text><Text style={styles.accountEmail}>Your basket currently lives only on this phone.</Text></>}</View>
    <Pressable disabled={busy} onPress={user ? onSignOut : onSignIn} style={user ? styles.secondaryButton : styles.primaryButton}>{busy ? <ActivityIndicator color={user ? colors.ink : colors.white} /> : <Text style={user ? styles.secondaryButtonText : styles.primaryButtonText}>{user ? 'Sign out' : 'Continue with Google'}</Text>}</Pressable>
    <View style={styles.infoCard}><Clock3 size={20} color={colors.berry} /><View style={{ flex: 1 }}><Text style={styles.infoTitle}>Fresh from 8am</Text><Text style={styles.infoCopy}>Tuesday–Sunday · 14 Admiralty Way, Lekki Phase 1</Text></View></View>
  </ScrollView>
}

function SuccessScreen({ order, onHome }) {
  return <View style={styles.successScreen}><View style={styles.successMark}><Check size={40} strokeWidth={3} color={colors.white} /></View><Text style={styles.kicker}>ORDER {order.id}</Text><Text style={styles.successTitle}>Your pastry plot is in motion.</Text><Text style={styles.successCopy}>{order.email_sent ? `Confirmation was queued for ${order.email}.` : 'Your order is saved. Email confirmation is not configured.'} Your {order.fulfillment} is set for {order.date} at {order.time}.</Text><Pressable onPress={onHome} style={styles.darkButton}><Text style={styles.darkButtonText}>Back to the bakery</Text></Pressable></View>
}

function BottomNav({ screen, setScreen, cartCount }) {
  const items = [{ id: 'home', label: 'Counter', Icon: Home }, { id: 'cart', label: 'Basket', Icon: ShoppingBag, badge: cartCount }, { id: 'account', label: 'Account', Icon: CircleUserRound }]
  return <View style={styles.bottomNav}>{items.map(({ id, label, Icon, badge }) => { const active = screen === id; return <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setScreen(id)} style={styles.navItem}><View><Icon size={21} strokeWidth={active ? 2.6 : 2} color={active ? colors.berry : colors.muted} />{badge ? <View style={styles.navBadge}><Text style={styles.navBadgeText}>{badge}</Text></View> : null}</View><Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text></Pressable> })}</View>
}

function MobileShop() {
  const [screen, setScreen] = useState('home')
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState({})
  const [user, setUser] = useState(null)
  const [category, setCategory] = useState('All treats')
  const [syncStatus, setSyncStatus] = useState('offline')
  const [loading, setLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [order, setOrder] = useState(null)
  const hydrated = useRef(false)
  const syncTimer = useRef(null)
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)
  useEffect(() => { ;(async () => {
    try {
      const [savedCart, token, catalog] = await Promise.all([AsyncStorage.getItem(CART_KEY), restoreSession(), getProducts()])
      const local = savedCart ? JSON.parse(savedCart) : {}
      setProducts(catalog.products || [])
      if (token) { const [{ user: currentUser }, serverCart] = await Promise.all([getCurrentUser(), getCart()]); setUser(currentUser); setCart(serverCart.items || {}) } else setCart(local)
    } catch (error) { setNotice(error.message) } finally { hydrated.current = true; setLoading(false) }
  })() }, [])
  useEffect(() => {
    if (!hydrated.current) return undefined
    AsyncStorage.setItem(CART_KEY, JSON.stringify(cart)).catch(() => {})
    if (!user) return undefined
    clearTimeout(syncTimer.current); syncTimer.current = setTimeout(() => syncCart(cart).catch(() => setSyncStatus('offline')), 220)
    return () => clearTimeout(syncTimer.current)
  }, [cart, user])
  useEffect(() => user ? connectCartChannel((items) => setCart((current) => cartsEqual(current, items) ? current : items), setSyncStatus) : undefined, [user])
  useEffect(() => { if (!notice) return undefined; const timer = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(timer) }, [notice])
  function changeQuantity(id, quantity) { setCart((current) => { const next = { ...current }; if (quantity <= 0) delete next[id]; else next[id] = Math.min(12, quantity); return next }) }
  async function handleSignIn() {
    setAuthBusy(true)
    try { const signedInUser = await signInWithGoogle(); const { items } = await getCart(); const merged = mergeCarts(items || {}, cart); setUser(signedInUser); setCart(merged); await syncCart(merged); setNotice('Signed in. Your basket is now live on web and mobile.') } catch (error) { setNotice(error.message) } finally { setAuthBusy(false) }
  }
  async function handleSignOut() {
    setAuthBusy(true)
    try { await signOut(); setUser(null); setSyncStatus('offline'); setNotice('Signed out. This basket remains saved on your phone.') } catch (error) { setNotice(error.message) } finally { setAuthBusy(false) }
  }
  function completeOrder(result) { setOrder(result); setCart({}); setScreen('success') }
  if (loading) return <View style={styles.loadingScreen}><LogoMark size={54} /><ActivityIndicator style={{ marginTop: 24 }} color={colors.berry} /><Text style={styles.loadingText}>Warming the ovens…</Text></View>
  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}><StatusBar style="dark" />{screen !== 'success' && <TopBar cartCount={cartCount} onCart={() => setScreen('cart')} />}<View style={styles.appBody}>
    {screen === 'home' && <HomeScreen products={products} cart={cart} user={user} syncStatus={syncStatus} category={category} setCategory={setCategory} onChange={changeQuantity} />}
    {screen === 'cart' && <CartScreen products={products} cart={cart} onChange={changeQuantity} onCheckout={() => cartCount && setScreen('checkout')} onBack={() => setScreen('home')} />}
    {screen === 'checkout' && <CheckoutScreen products={products} cart={cart} user={user} onBack={() => setScreen('cart')} onComplete={completeOrder} />}
    {screen === 'account' && <AccountScreen user={user} syncStatus={syncStatus} onSignIn={handleSignIn} onSignOut={handleSignOut} busy={authBusy} />}
    {screen === 'success' && <SuccessScreen order={order} onHome={() => setScreen('home')} />}
  </View>{!['checkout', 'success'].includes(screen) && <BottomNav screen={screen} setScreen={setScreen} cartCount={cartCount} />}{notice ? <View style={styles.notice} accessibilityLiveRegion="polite"><Text style={styles.noticeText}>{notice}</Text></View> : null}</SafeAreaView>
}

export default function App() {
  const [fredokaLoaded] = useFredoka({ Fredoka_500Medium, Fredoka_600SemiBold })
  const [nunitoLoaded] = useNunito({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold })
  if (!fredokaLoaded || !nunitoLoaded) return null
  return <SafeAreaProvider><MobileShop /></SafeAreaProvider>
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper }, appBody: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.custard }, loadingText: { marginTop: 12, color: colors.muted, fontFamily: type.bold },
  logoPetal: { position: 'absolute', backgroundColor: colors.custard }, brand: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brandText: { color: colors.ink, fontFamily: type.display, fontSize: 17, letterSpacing: -0.5 },
  topBar: { minHeight: 66, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E9E1D0', backgroundColor: colors.paper },
  basketPill: { minWidth: 58, minHeight: 44, paddingHorizontal: 10, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: colors.ink },
  basketPillText: { minWidth: 21, height: 21, paddingTop: 2, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.custard, color: colors.ink, fontFamily: type.extraBold, fontSize: 12, textAlign: 'center' },
  homeContent: { paddingBottom: 36 }, hero: { minHeight: 425, overflow: 'hidden', margin: 14, padding: 22, borderWidth: 2, borderColor: colors.ink, borderRadius: 26, backgroundColor: colors.custard, ...shadows.card },
  heroDecorationOne: { position: 'absolute', right: -52, top: 30, width: 180, height: 180, borderRadius: 100, backgroundColor: colors.peach, borderWidth: 2, borderColor: colors.ink },
  heroDecorationTwo: { position: 'absolute', right: 28, top: 82, width: 70, height: 70, borderRadius: 50, backgroundColor: colors.cobalt, borderWidth: 2, borderColor: colors.ink },
  syncBadgeMuted: { alignSelf: 'flex-start', minHeight: 30, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, syncBadgeLive: { borderColor: '#AAD39C', backgroundColor: '#EFF9EB' }, syncBadgeMutedText: { color: colors.muted, fontFamily: type.bold, fontSize: 11 },
  eyebrowRow: { marginTop: 34, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 7 }, eyebrow: { color: colors.berryDark, fontFamily: type.extraBold, fontSize: 11, letterSpacing: 1.3 },
  heroTitle: { maxWidth: 305, color: colors.ink, fontFamily: type.display, fontSize: 50, lineHeight: 47, letterSpacing: -2.6 }, heroCopy: { maxWidth: 300, marginTop: 16, marginBottom: 20, color: '#514249', fontFamily: type.body, fontSize: 15, lineHeight: 22 },
  heroTicket: { position: 'absolute', right: 16, bottom: 19, width: 142, padding: 12, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white, transform: [{ rotate: '-3deg' }] }, ticketKicker: { color: colors.muted, fontFamily: type.extraBold, fontSize: 8, letterSpacing: 0.8 }, ticketTitle: { marginVertical: 3, color: colors.ink, fontFamily: type.display, fontSize: 16 }, ticketFoot: { color: colors.berry, fontFamily: type.extraBold, fontSize: 8 },
  primaryButton: { minHeight: 50, paddingHorizontal: 18, borderRadius: 13, borderWidth: 2, borderColor: colors.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.berry, shadowColor: colors.ink, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 }, primaryButtonText: { color: colors.white, fontFamily: type.extraBold, fontSize: 14 },
  sectionIntro: { paddingHorizontal: 18, paddingTop: 28 }, kicker: { color: colors.berryDark, fontFamily: type.extraBold, fontSize: 11, letterSpacing: 1.35 }, sectionTitle: { marginTop: 5, color: colors.ink, fontFamily: type.display, fontSize: 37, lineHeight: 40, letterSpacing: -1.6 }, sectionCopy: { marginTop: 10, color: colors.muted, fontFamily: type.body, fontSize: 15, lineHeight: 22 },
  categoryRow: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 16, gap: 8 }, categoryChip: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }, categoryChipActive: { borderColor: colors.ink, backgroundColor: colors.ink }, categoryText: { color: colors.ink, fontFamily: type.bold, fontSize: 13 }, categoryTextActive: { color: colors.white },
  productRow: { paddingHorizontal: 11 }, productCell: { width: '50%', padding: 5 }, productCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.white }, productArt: { height: 150, alignItems: 'center', justifyContent: 'flex-end' },
  productBadge: { position: 'absolute', zIndex: 2, top: 9, left: 8, maxWidth: 138, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.ink, borderRadius: 12, backgroundColor: colors.paper, color: colors.ink, fontFamily: type.extraBold, fontSize: 8, textTransform: 'uppercase' },
  productInfo: { minHeight: 198, padding: 12 }, productName: { minHeight: 39, color: colors.ink, fontFamily: type.display, fontSize: 18, lineHeight: 19 }, productPrice: { marginTop: 5, color: colors.berryDark, fontFamily: type.extraBold, fontSize: 13 }, productDescription: { minHeight: 38, marginVertical: 8, color: colors.muted, fontFamily: type.body, fontSize: 11, lineHeight: 16 },
  addButton: { minHeight: 44, marginTop: 'auto', paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.ink }, addButtonText: { color: colors.white, fontFamily: type.extraBold, fontSize: 12 },
  quantity: { minHeight: 44, borderWidth: 1, borderColor: colors.ink, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, quantityCompact: { minHeight: 40, marginTop: 'auto' }, quantityButton: { width: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }, quantityText: { color: colors.ink, fontFamily: type.extraBold, fontSize: 14 },
  screenContent: { padding: 18, paddingBottom: 48 }, screenHeadingRow: { marginBottom: 24, flexDirection: 'row', alignItems: 'flex-start', gap: 13 }, screenTitle: { marginTop: 4, color: colors.ink, fontFamily: type.display, fontSize: 34, lineHeight: 37, letterSpacing: -1.4 }, iconButton: { width: 44, height: 44, borderRadius: 23, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  emptyState: { minHeight: 340, padding: 26, alignItems: 'center', justifyContent: 'center' }, emptyIcon: { width: 72, height: 72, marginBottom: 18, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FCE7EC' }, emptyTitle: { color: colors.ink, fontFamily: type.display, fontSize: 25, textAlign: 'center' }, emptyCopy: { marginTop: 8, marginBottom: 20, color: colors.muted, fontFamily: type.body, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  cartList: { gap: 11 }, cartItem: { minHeight: 112, padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.white }, cartThumb: { width: 86, height: 86, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, cartItemInfo: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' }, cartItemName: { color: colors.ink, fontFamily: type.display, fontSize: 17 }, cartItemPrice: { marginTop: 2, marginBottom: 7, color: colors.muted, fontFamily: type.bold, fontSize: 12 },
  summaryCard: { marginTop: 18, padding: 19, borderWidth: 2, borderColor: colors.ink, borderRadius: 18, backgroundColor: colors.custard }, summaryLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, summaryLabel: { color: colors.muted, fontFamily: type.bold, fontSize: 14 }, summaryTotal: { color: colors.ink, fontFamily: type.display, fontSize: 26 }, summaryHint: { marginTop: 4, marginBottom: 18, color: colors.muted, fontFamily: type.body, fontSize: 12 },
  formCard: { marginBottom: 14, padding: 17, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.white }, formSectionTitle: { marginBottom: 16, color: colors.ink, fontFamily: type.display, fontSize: 21 }, field: { marginBottom: 14 }, fieldLabel: { marginBottom: 6, color: colors.ink, fontFamily: type.bold, fontSize: 12 }, input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 11, backgroundColor: colors.paper, color: colors.ink, fontFamily: type.body, fontSize: 16 }, inputError: { borderColor: colors.danger }, textarea: { minHeight: 100, paddingTop: 13, textAlignVertical: 'top' }, errorText: { marginTop: 5, color: colors.danger, fontFamily: type.semibold, fontSize: 11 },
  choiceRow: { marginBottom: 15, flexDirection: 'row', gap: 10 }, choiceCard: { flex: 1, minHeight: 108, padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.paper }, choiceCardActive: { borderColor: colors.berryDark, backgroundColor: colors.berryDark }, choiceTitle: { marginTop: 8, color: colors.ink, fontFamily: type.extraBold, fontSize: 14, textTransform: 'capitalize' }, choiceHint: { marginTop: 2, color: colors.muted, fontFamily: type.body, fontSize: 11 },
  timeRow: { paddingTop: 2, paddingBottom: 8, gap: 8 }, timeChip: { minWidth: 66, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, timeChipActive: { borderColor: colors.cobalt, backgroundColor: colors.cobalt }, timeText: { color: colors.ink, fontFamily: type.bold, fontSize: 12 },
  paymentNote: { marginTop: 4, padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#EFF9EB' }, paymentTitle: { color: colors.ink, fontFamily: type.bold, fontSize: 12 }, paymentCopy: { marginTop: 2, color: colors.muted, fontFamily: type.body, fontSize: 11, lineHeight: 16 }, checkoutTotal: { marginVertical: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, formAlert: { marginBottom: 10, padding: 12, borderRadius: 10, backgroundColor: '#FDE8E7', color: colors.danger, fontFamily: type.semibold, fontSize: 12 },
  accountCard: { marginVertical: 24, padding: 24, borderWidth: 2, borderColor: colors.ink, borderRadius: 20, alignItems: 'center', backgroundColor: colors.custard, ...shadows.card }, avatarCircle: { width: 70, height: 70, marginBottom: 12, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }, accountName: { color: colors.ink, fontFamily: type.display, fontSize: 24, textAlign: 'center' }, accountEmail: { marginTop: 3, marginBottom: 14, color: colors.muted, fontFamily: type.body, fontSize: 13, textAlign: 'center' },
  secondaryButton: { minHeight: 50, paddingHorizontal: 18, borderWidth: 2, borderColor: colors.ink, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }, secondaryButtonText: { color: colors.ink, fontFamily: type.extraBold, fontSize: 14 }, infoCard: { marginTop: 24, padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 14, flexDirection: 'row', gap: 11, backgroundColor: colors.white }, infoTitle: { color: colors.ink, fontFamily: type.bold, fontSize: 13 }, infoCopy: { marginTop: 2, color: colors.muted, fontFamily: type.body, fontSize: 12, lineHeight: 17 },
  successScreen: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.custard }, successMark: { width: 82, height: 82, marginBottom: 22, borderRadius: 43, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.berry, shadowColor: colors.ink, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 1, shadowRadius: 0 }, successTitle: { marginTop: 12, color: colors.ink, fontFamily: type.display, fontSize: 43, lineHeight: 43, letterSpacing: -2, textAlign: 'center' }, successCopy: { marginVertical: 20, color: colors.muted, fontFamily: type.body, fontSize: 15, lineHeight: 23, textAlign: 'center' }, darkButton: { minHeight: 50, paddingHorizontal: 22, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }, darkButtonText: { color: colors.white, fontFamily: type.extraBold, fontSize: 14 },
  bottomNav: { minHeight: 72, paddingHorizontal: 24, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 12 : 8, borderTopWidth: 1, borderTopColor: '#E5DDCD', flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.white }, navItem: { minWidth: 72, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 4 }, navLabel: { color: colors.muted, fontFamily: type.bold, fontSize: 10 }, navLabelActive: { color: colors.berry }, navBadge: { position: 'absolute', right: -12, top: -7, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.custard, borderWidth: 1, borderColor: colors.ink }, navBadgeText: { color: colors.ink, fontFamily: type.extraBold, fontSize: 9 },
  notice: { position: 'absolute', left: 18, right: 18, bottom: 86, padding: 13, borderRadius: 12, backgroundColor: colors.ink, ...shadows.card }, noticeText: { color: colors.white, fontFamily: type.semibold, fontSize: 12, lineHeight: 18, textAlign: 'center' }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
})
