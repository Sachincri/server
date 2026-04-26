import { toPublicSettings } from "../../../src/controllers/settings.controller";

describe("public settings sanitization", () => {
    it("excludes server-side secrets from public settings", () => {
        const publicSettings = toPublicSettings({
            codEnabled: true,
            stripeEnabled: true,
            brevoApiKey: "brevo-secret",
            whatsappToken: "whatsapp-secret",
            whatsappAppSecret: "whatsapp-app-secret",
            shiprocketPassword: "shiprocket-secret",
            delhiveryApiToken: "delhivery-secret",
        });

        expect(publicSettings).toMatchObject({
            codEnabled: true,
            stripeEnabled: true,
        });
        expect(publicSettings).not.toHaveProperty("brevoApiKey");
        expect(publicSettings).not.toHaveProperty("whatsappToken");
        expect(publicSettings).not.toHaveProperty("whatsappAppSecret");
        expect(publicSettings).not.toHaveProperty("shiprocketPassword");
        expect(publicSettings).not.toHaveProperty("delhiveryApiToken");
    });
});
