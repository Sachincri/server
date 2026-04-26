import axios, { AxiosInstance } from "axios";
import Settings from "../models/Settings.model";
import { IOrder } from "../models/Order.model";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShipmentResult {
  provider: "shiprocket" | "delhivery";
  providerOrderId: string;
  shipmentId: string;
  awbNumber: string;
  courierName: string;
  trackingUrl: string;
  labelUrl?: string;
  estimatedDelivery?: Date;
}

interface TrackingEvent {
  date: string;
  activity: string;
  location: string;
}

interface TrackingResult {
  currentStatus: string;
  estimatedDelivery?: string;
  courierName: string;
  awbNumber: string;
  trackingUrl: string;
  events: TrackingEvent[];
}

// ─── Shiprocket ──────────────────────────────────────────────────────────────

class ShiprocketAPI {
  private baseUrl = "https://apiv2.shiprocket.in/v1/external";
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  private async getClient(email: string, password: string): Promise<AxiosInstance> {
    // Token valid for 24 hours, re-use if fresh
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return axios.create({
        baseURL: this.baseUrl,
        headers: { Authorization: `Bearer ${this.token}` },
      });
    }

    try {
      const { data } = await axios.post(`${this.baseUrl}/auth/login`, { email, password });
      this.token = data.token;
      this.tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000; // 23h buffer

      return axios.create({
        baseURL: this.baseUrl,
        headers: { Authorization: `Bearer ${this.token}` },
      });
    } catch (err: any) {
      console.error("[Shiprocket] Auth failed:", err?.response?.data || err.message);
      throw new Error("Shiprocket authentication failed. Check email/password in Settings.");
    }
  }

  async createOrder(order: IOrder, settings: any): Promise<ShipmentResult> {
    const client = await this.getClient(settings.shiprocketEmail, settings.shiprocketPassword);

    const payload = {
      order_id: String(order._id),
      order_date: new Date(order.createdAt).toISOString().split("T")[0],
      pickup_location: "Primary",
      channel_id: settings.shiprocketChannelId || undefined,
      billing_customer_name: order.shippingInfo.firstName,
      billing_last_name: order.shippingInfo.lastName || "",
      billing_address: order.shippingInfo.address,
      billing_city: order.shippingInfo.city,
      billing_pincode: order.shippingInfo.pinCode,
      billing_state: order.shippingInfo.state,
      billing_country: order.shippingInfo.country || "India",
      billing_email: order.shippingInfo.email || "",
      billing_phone: order.shippingInfo.phoneNo,
      shipping_is_billing: true,
      order_items: order.orderItems.map((item: any) => ({
        name: item.name,
        sku: item.product.toString().slice(-8),
        units: item.quantity,
        selling_price: item.sellingPrice,
        discount: 0,
        tax: 0,
      })),
      payment_method: order.paymentInfo?.method === "COD" ? "COD" : "Prepaid",
      sub_total: order.itemsPrice,
      length: settings.defaultBoxLength || 20,
      breadth: settings.defaultBoxBreadth || 15,
      height: settings.defaultBoxHeight || 10,
      weight: order.orderItems.reduce((acc: number, item: any) => acc + ((item.weight || settings.defaultBoxWeight || 0.5) * item.quantity), 0),
    };

    try {
      const { data } = await client.post("/orders/create/adhoc", payload);

      const orderId = data.order_id?.toString() || "";
      const shipmentId = data.shipment_id?.toString() || "";
      const awb = data.awb_code || "";
      const courier = data.courier_name || "Assigned";

      return {
        provider: "shiprocket",
        providerOrderId: orderId,
        shipmentId,
        awbNumber: awb,
        courierName: courier,
        trackingUrl: awb
          ? `https://shiprocket.co/tracking/${awb}`
          : `https://shiprocket.co/tracking`,
        labelUrl: data.label_url || undefined,
        estimatedDelivery: data.etd ? new Date(data.etd) : undefined,
      };
    } catch (err: any) {
      console.error("[Shiprocket] Create order failed:", err?.response?.data || err.message);
      throw new Error(
        `Shiprocket order creation failed: ${err?.response?.data?.message || err.message}`
      );
    }
  }

  async trackShipment(awb: string, settings: any): Promise<TrackingResult> {
    const client = await this.getClient(settings.shiprocketEmail, settings.shiprocketPassword);

    try {
      const { data } = await client.get(`/courier/track/awb/${awb}`);
      const info = data?.tracking_data;
      const activities = info?.shipment_track_activities || [];

      return {
        currentStatus: info?.shipment_status_text || info?.track_status || "In Transit",
        estimatedDelivery: info?.etd || undefined,
        courierName: info?.courier_name || "Unknown",
        awbNumber: awb,
        trackingUrl: `https://shiprocket.co/tracking/${awb}`,
        events: activities.map((a: any) => ({
          date: a.date,
          activity: a.activity || a["sr-status-label"] || a.status,
          location: a.location || "",
        })),
      };
    } catch (err: any) {
      console.error("[Shiprocket] Track failed:", err?.response?.data || err.message);
      throw new Error("Failed to fetch tracking from Shiprocket");
    }
  }

  async cancelOrder(providerOrderId: string, settings: any): Promise<void> {
    const client = await this.getClient(settings.shiprocketEmail, settings.shiprocketPassword);
    try {
      await client.post("/orders/cancel", { ids: [Number(providerOrderId)] });
    } catch (err: any) {
      console.error("[Shiprocket] Cancel failed:", err?.response?.data || err.message);
      // Non-fatal — log but don't throw
    }
  }
}

// ─── Delhivery ───────────────────────────────────────────────────────────────

class DelhiveryAPI {
  private baseUrl = "https://track.delhivery.com";
  // Removed staging url to fix unused variable warning

  private getClient(token: string): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async createOrder(order: IOrder, settings: any): Promise<ShipmentResult> {
    const client = this.getClient(settings.delhiveryApiToken);

    const shipmentData = {
      shipments: [
        {
          name: `${order.shippingInfo.firstName} ${order.shippingInfo.lastName || ""}`.trim(),
          add: order.shippingInfo.address,
          pin: order.shippingInfo.pinCode.toString(),
          city: order.shippingInfo.city,
          state: order.shippingInfo.state,
          country: order.shippingInfo.country || "India",
          phone: order.shippingInfo.phoneNo,
          order: (order as any)._id.toString(),
          payment_mode: order.paymentInfo?.method === "COD" ? "COD" : "Prepaid",
          return_pin: "",
          return_city: "",
          return_phone: "",
          return_add: "",
          return_state: "",
          return_country: "",
          products_desc: order.orderItems.map((i: any) => i.name).join(", "),
          hsn_code: "",
          cod_amount: order.paymentInfo?.method === "COD" ? order.totalPrice.toString() : "0",
          order_date: new Date(order.createdAt).toISOString(),
          total_amount: order.totalPrice.toString(),
          seller_add: "",
          seller_name: "",
          seller_inv: "",
          quantity: order.orderItems.reduce((sum: number, i: any) => sum + i.quantity, 0).toString(),
          waybill: "", // Auto-generated by Delhivery
          shipment_width: settings.defaultBoxBreadth || 15,
          shipment_height: settings.defaultBoxHeight || 10,
          weight: order.orderItems.reduce((acc: number, item: any) => acc + ((item.weight || settings.defaultBoxWeight || 0.5) * item.quantity), 0) * 1000, // Delhivery uses grams
          seller_gst_tin: "",
          shipping_mode: "Surface",
          address_type: "home",
        },
      ],
      pickup_location: {
        name: settings.delhiveryWarehouseName || "Default Warehouse",
      },
    };

    try {
      const formData = `format=json&data=${JSON.stringify(shipmentData)}`;
      const { data } = await client.post("/api/cmu/create.json", formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const pkg = data?.packages?.[0] || {};
      const waybill = pkg.waybill || "";
      const status = pkg.status || "Success";

      if (!waybill && status !== "Success") {
        throw new Error(pkg.remarks || "Delhivery order creation failed");
      }

      return {
        provider: "delhivery",
        providerOrderId: (order as any)._id.toString(),
        shipmentId: waybill,
        awbNumber: waybill,
        courierName: "Delhivery",
        trackingUrl: waybill
          ? `https://www.delhivery.com/track/package/${waybill}`
          : "https://www.delhivery.com/track",
      };
    } catch (err: any) {
      console.error("[Delhivery] Create order failed:", err?.response?.data || err.message);
      throw new Error(
        `Delhivery order creation failed: ${err?.response?.data?.rmk || err.message}`
      );
    }
  }

  async trackShipment(waybill: string, settings: any): Promise<TrackingResult> {
    const client = this.getClient(settings.delhiveryApiToken);

    try {
      const { data } = await client.get(`/api/v1/packages/json/`, {
        params: { waybill },
      });

      const pkg = data?.ShipmentData?.[0]?.Shipment || {};
      const scans = pkg?.Scans || [];

      return {
        currentStatus: pkg?.Status?.Status || "In Transit",
        estimatedDelivery: pkg?.ExpectedDeliveryDate || undefined,
        courierName: "Delhivery",
        awbNumber: waybill,
        trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
        events: scans
          .map((s: any) => ({
            date: s.ScanDetail?.ScanDateTime || "",
            activity: s.ScanDetail?.Instructions || s.ScanDetail?.Scan || "",
            location: s.ScanDetail?.ScannedLocation || "",
          }))
          .reverse(),
      };
    } catch (err: any) {
      console.error("[Delhivery] Track failed:", err?.response?.data || err.message);
      throw new Error("Failed to fetch tracking from Delhivery");
    }
  }

  async cancelOrder(waybill: string, settings: any): Promise<void> {
    const client = this.getClient(settings.delhiveryApiToken);
    try {
      await client.post("/api/p/edit", null, {
        params: { waybill, cancellation: true },
      });
    } catch (err: any) {
      console.error("[Delhivery] Cancel failed:", err?.response?.data || err.message);
    }
  }
}

// ─── Unified Facade ──────────────────────────────────────────────────────────

const shiprocket = new ShiprocketAPI();
const delhivery = new DelhiveryAPI();

class ShippingService {
  /**
   * Fetch current shipping settings from DB
   */
  private async getSettings() {
    const settings = await Settings.findOne().sort({ createdAt: -1 }).lean();
    if (!settings) throw new Error("App settings not found");
    return settings;
  }

  /**
   * Create a shipment with the active provider.
   * Returns null if provider is "manual" (no integration).
   */
  async createShipment(order: IOrder): Promise<ShipmentResult | null> {
    const settings = await this.getSettings();
    const provider = settings.shippingProvider || "manual";

    if (provider === "manual") {
      return null; // No automatic shipment
    }

    if (provider === "shiprocket") {
      if (!settings.shiprocketEnabled || !settings.shiprocketEmail || !settings.shiprocketPassword) {
        console.warn("[Shipping] Shiprocket selected but not configured. Skipping.");
        return null;
      }
      return shiprocket.createOrder(order, settings);
    }

    if (provider === "delhivery") {
      if (!settings.delhiveryEnabled || !settings.delhiveryApiToken) {
        console.warn("[Shipping] Delhivery selected but not configured. Skipping.");
        return null;
      }
      return delhivery.createOrder(order, settings);
    }

    return null;
  }

  /**
   * Get live tracking for an order.
   */
  async getTracking(order: IOrder): Promise<TrackingResult | null> {
    const shipment = order.shipment;
    if (!shipment || !shipment.awbNumber || shipment.provider === "manual") {
      return null;
    }

    const settings = await this.getSettings();

    if (shipment.provider === "shiprocket") {
      return shiprocket.trackShipment(shipment.awbNumber, settings);
    }

    if (shipment.provider === "delhivery") {
      return delhivery.trackShipment(shipment.awbNumber, settings);
    }

    return null;
  }

  /**
   * Cancel a shipment with the provider.
   */
  async cancelShipment(order: IOrder): Promise<void> {
    const shipment = order.shipment;
    if (!shipment || shipment.provider === "manual") return;

    const settings = await this.getSettings();

    try {
      if (shipment.provider === "shiprocket" && shipment.providerOrderId) {
        await shiprocket.cancelOrder(shipment.providerOrderId, settings);
      } else if (shipment.provider === "delhivery" && shipment.awbNumber) {
        await delhivery.cancelOrder(shipment.awbNumber, settings);
      }
    } catch (err: any) {
      console.error("[Shipping] Cancel shipment error (non-fatal):", err.message);
    }
  }
}

export const shippingService = new ShippingService();
