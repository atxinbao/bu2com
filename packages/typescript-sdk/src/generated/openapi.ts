export interface paths {
    "/environment": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read the server-authored environment and execution contract before mutations */
        get: operations["getEnvironment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/quotes": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a seller quote */
        post: operations["createQuote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payment_intents": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a buyer payment intent and evaluate its mandate */
        post: operations["createPaymentIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payment_intents/{payment_intent_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read payment and authorization state */
        get: operations["getPaymentIntent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payment_intents/{payment_intent_id}/authorization": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Record a human authorization decision */
        post: operations["decideAuthorization"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/transactions": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List transactions with payment, delivery, channel, and receipt context */
        get: operations["listTransactions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/transactions/{transaction_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read one transaction and its related payment evidence */
        get: operations["getTransaction"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/transactions/{transaction_id}/deliveries": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit machine-readable delivery evidence */
        post: operations["submitDelivery"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/transactions/{transaction_id}/settlements": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Settle a delivered transaction */
        post: operations["settleTransaction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/transactions/{transaction_id}/settlement_recoveries": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Query an unknown provider settlement without submitting another payment */
        post: operations["recoverTransactionSettlement"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/receipts/{receipt_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read a verifiable receipt */
        get: operations["getReceipt"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/receipts/{receipt_id}/verify": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Verify a receipt signature and transaction binding */
        get: operations["verifyReceipt"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhook_subscriptions": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create an idempotent Webhook subscription */
        post: operations["createWebhookSubscription"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhook_subscriptions/{subscription_id}/secret_rotations": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add a new signing-secret version with a bounded overlap window */
        post: operations["rotateWebhookSecret"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhook_dead_letters": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List terminal Webhook delivery failures */
        get: operations["listWebhookDeadLetters"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhook_outbox/{outbox_id}/attempts": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List immutable delivery-attempt audit records */
        get: operations["listWebhookDeliveryAttempts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/webhook_outbox/{outbox_id}/replays": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Requeue one dead-lettered event without creating a new business event */
        post: operations["replayWebhook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        EnvironmentInfo: {
            /** @constant */
            service: "bu2-reference-server";
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            /** @constant */
            environment_contract_version: "1.0";
            /** @enum {integer|null} */
            chain_id: null | 84532 | 8453;
            /** @enum {string|null} */
            network: null | "eip155:84532" | "eip155:8453";
            /** @enum {string} */
            execution_backend: "simulated" | "x402";
            /** @constant */
            api_contract_version: "0.2.0";
            mcp_contract_versions: "0.2.0"[];
            receipt_schema_versions: ("0.2" | "0.3")[];
            /** @enum {string} */
            execution_status: "execution_disabled" | "execution_enabled";
            public_capabilities: string[];
            receipt_issuer: components["schemas"]["ReceiptIssuer"];
        };
        ReceiptIssuer: {
            issuer_id: string;
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            verification_key_id: string;
            /** @enum {string} */
            signature_algorithm: "Ed25519";
            public_key: string;
        };
        ReceiptEnvironmentInterpretation: {
            /** @enum {string} */
            source: "native" | "legacy" | "unknown";
            original: string | null;
            /** @enum {string|null} */
            derived: "local" | "sandbox" | "live" | null;
            evidence: string;
        };
        CreateWebhookSubscription: {
            id: string;
            /** Format: uri */
            url: string;
            secret: string;
        };
        WebhookSecretVersion: {
            version: string;
            valid_from: number;
            valid_until: number | null;
            /** Format: date-time */
            created_at: string;
            current: boolean;
        };
        WebhookSubscription: {
            id: string;
            /** Format: uri */
            url: string;
            active: boolean;
            current_secret_version: string;
            /** Format: date-time */
            created_at: string;
            secret_versions: components["schemas"]["WebhookSecretVersion"][];
        };
        RotateWebhookSecret: {
            version: string;
            secret: string;
            overlap_seconds: number;
        };
        WebhookSecretRotation: {
            id: string;
            subscription_id: string;
            previous_version: string;
            new_version: string;
            overlap_until: number;
            /** Format: date-time */
            created_at: string;
        };
        WebhookOutboxRecord: {
            id: string;
            event_id: string;
            subscription_id: string;
            /** @description Serialized immutable LedgerEvent */
            payload: string;
            /** @enum {string} */
            status: "pending" | "delivering" | "retrying" | "dead_letter" | "delivered";
            attempts: number;
            next_attempt_at: number;
            last_error?: string | null;
            /** Format: date-time */
            delivered_at?: string | null;
            /** Format: date-time */
            dead_lettered_at?: string | null;
            lease_expires_at?: number | null;
            locked_by?: string | null;
            /** Format: date-time */
            last_attempt_at?: string | null;
            replay_count: number;
            /** Format: date-time */
            last_replayed_at?: string | null;
            request_id?: string | null;
            trace_id?: string | null;
            transaction_id?: string | null;
        };
        WebhookOutboxList: {
            data: components["schemas"]["WebhookOutboxRecord"][];
        };
        WebhookDeliveryAttempt: {
            id: string;
            outbox_id: string;
            event_id: string;
            subscription_id: string;
            replay_cycle: number;
            attempt_number: number;
            worker_id: string;
            /** @enum {string} */
            status: "retrying" | "dead_letter" | "delivered";
            http_status?: number | null;
            error?: string | null;
            secret_versions: string[];
            /** Format: date-time */
            started_at: string;
            /** Format: date-time */
            completed_at: string;
            request_id?: string | null;
            trace_id?: string | null;
            transaction_id?: string | null;
        };
        WebhookDeliveryAttemptList: {
            data: components["schemas"]["WebhookDeliveryAttempt"][];
        };
        ReplayWebhook: {
            requested_by: string;
            reason: string;
        };
        WebhookReplay: {
            id: string;
            outbox_id: string;
            event_id: string;
            subscription_id: string;
            requested_by: string;
            reason: string;
            /** @enum {string} */
            prior_status: "dead_letter";
            /** Format: date-time */
            created_at: string;
        };
        Amount: {
            /** @description Amount in minor units */
            value: number;
            currency: string;
        };
        CreateQuote: {
            seller_agent_id: string;
            payee_account_id: string;
            item: {
                name: string;
                delivery_type: string;
            };
            amount: components["schemas"]["Amount"];
            /** Format: date-time */
            expires_at: string;
        };
        Quote: {
            id: string;
            seller_agent_id: string;
            payee_account_id: string;
            item: {
                name: string;
                delivery_type: string;
            };
            amount: components["schemas"]["Amount"];
            /** Format: date-time */
            expires_at: string;
            /** @enum {string} */
            status: "active" | "accepted" | "expired" | "canceled";
            /** Format: date-time */
            created_at: string;
        };
        ExternalContext: {
            /** @enum {string} */
            type: "chatgpt_conversation" | "codex_task" | "agent_run" | "automation" | "other";
            id: string;
        };
        CreatePaymentIntent: {
            quote_id: string;
            payer_account_id: string;
            buyer_agent_id: string;
            payment_mandate_id: string;
            amount: components["schemas"]["Amount"];
            purpose: string;
            external_context?: components["schemas"]["ExternalContext"];
            metadata?: {
                [key: string]: string;
            };
        };
        Authorization: {
            id: string;
            /** @enum {string} */
            decision: "allowed" | "review_required" | "denied";
            reason_code: string;
            matched_rules: string[];
        };
        PaymentIntent: {
            id: string;
            quote_id: string;
            payer_account_id: string;
            payee_account_id: string;
            buyer_agent_id: string;
            seller_agent_id: string;
            payment_mandate_id: string;
            amount: components["schemas"]["Amount"];
            purpose: string;
            external_context?: components["schemas"]["ExternalContext"];
            metadata?: {
                [key: string]: string;
            };
            /** @enum {string} */
            status: "requires_authorization" | "authorized" | "funds_reserved" | "delivery_submitted" | "settled" | "declined" | "expired" | "canceled" | "refunded" | "disputed";
            transaction_id: string | null;
            authorization: components["schemas"]["Authorization"];
            /** Format: date-time */
            created_at: string;
        };
        DeliveryEvidence: {
            type: string;
            evidence_hash: string;
            summary?: string;
        };
        DeliveryRecord: {
            id: string;
            transaction_id: string;
            type: string;
            evidence_hash: string;
            summary?: string;
            /** Format: date-time */
            submitted_at: string;
        };
        Transaction: {
            id: string;
            payment_intent_id: string;
            /** @enum {string} */
            status: "authorized" | "funds_reserved" | "delivery_submitted" | "settled" | "canceled" | "refunded" | "disputed";
            authorized_amount: components["schemas"]["Amount"];
            reserved_amount: components["schemas"]["Amount"];
            settled_amount: components["schemas"]["Amount"];
            refunded_amount: components["schemas"]["Amount"];
        };
        TransactionView: {
            transaction: components["schemas"]["Transaction"];
            payment_intent: components["schemas"]["PaymentIntent"] | null;
            quote: components["schemas"]["Quote"] | null;
            delivery: components["schemas"]["DeliveryRecord"] | null;
            receipt: components["schemas"]["Receipt"] | null;
            payment_channel: string;
            settlement_control: components["schemas"]["SettlementControl"] | null;
        };
        SettlementControl: {
            /** @enum {string} */
            status: "settled" | "provider_unknown";
            provider_reference: string;
            reason_code: string | null;
            /** Format: date-time */
            updated_at: string;
            /** Format: date-time */
            resolved_at: string | null;
            recovery_attempts: number;
        };
        SettlementRecovery: {
            /** @enum {string} */
            status: "provider_unknown" | "settled";
            reason_code: string | null;
            attempt_id: string;
        };
        SettlementRecoveryResult: {
            transaction: components["schemas"]["Transaction"];
            receipt: components["schemas"]["Receipt"] | null;
            recovery: components["schemas"]["SettlementRecovery"];
        };
        PageMetadata: {
            limit: number;
            has_more: boolean;
            next_cursor: string | null;
        };
        TransactionPage: {
            data: components["schemas"]["TransactionView"][];
            page: components["schemas"]["PageMetadata"];
        };
        Receipt: {
            id: string;
            /** @enum {string} */
            version: "0.2" | "0.3";
            /** @enum {string} */
            schema_version: "0.2" | "0.3";
            /** @enum {string} */
            canonicalization_version: "RFC8785-JCS-1";
            transaction_id: string;
            settlement_id: string;
            quote_id: string;
            payment_intent_id: string;
            payer_account_id: string;
            payee_account_id: string;
            buyer_agent_id: string;
            seller_agent_id: string;
            amount: components["schemas"]["Amount"];
            authorization_id: string;
            payment_mandate_id: string;
            delivery_id: string;
            delivery_evidence_hash: string;
            /** @enum {string} */
            environment: "simulation" | "testnet" | "local" | "sandbox" | "live";
            /** @enum {string} */
            environment_contract_version?: "1.0";
            /** @enum {string} */
            execution_backend?: "simulated" | "x402";
            /** @enum {integer|null} */
            chain_id?: null | 84532 | 8453;
            /** @enum {string|null} */
            network?: null | "eip155:84532" | "eip155:8453";
            receipt_issuer_id?: string;
            payment_channel: string;
            provider_reference: string | null;
            /** Format: date-time */
            signed_at: string;
            /** Format: date-time */
            issued_at: string;
            /** @enum {string} */
            signature_algorithm: "Ed25519";
            verification_key_id: string;
            signature: string;
            public_key: string;
            readonly valid?: boolean;
            readonly signature_valid?: boolean;
            readonly issuer_trusted?: boolean;
            readonly settlement_confirmed?: boolean;
        } & unknown;
        Error: {
            error: {
                type: string;
                code: string;
                message: string;
                request_id: string;
                trace_id: string;
                details?: {
                    [key: string]: unknown;
                };
            };
        };
    };
    responses: {
        /** @description Invalid body, path identifier, query, cursor, or idempotency key */
        BadRequest: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Trace-Id": components["headers"]["TraceId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Idempotency or state conflict */
        Conflict: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Trace-Id": components["headers"]["TraceId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description JSON request body exceeds 1 MiB */
        RequestTooLarge: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Trace-Id": components["headers"]["TraceId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Content-Type is not application/json */
        UnsupportedMediaType: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Trace-Id": components["headers"]["TraceId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Resource not found */
        NotFound: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Trace-Id": components["headers"]["TraceId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
        TraceId: string;
        IdempotencyKey: string;
        PaymentIntentId: string;
        TransactionId: string;
        ReceiptId: string;
        WebhookSubscriptionId: string;
        WebhookOutboxId: string;
        PageLimit: number;
        /** @description Opaque cursor returned by the preceding page. */
        PageCursor: string;
    };
    requestBodies: never;
    headers: {
        /** @description Server-generated identifier for this HTTP request. */
        RequestId: string;
        /** @description End-to-end trace identifier accepted from the caller or generated by BU2. */
        TraceId: string;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getEnvironment: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Versioned environment information and current Receipt issuer */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnvironmentInfo"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    createQuote: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateQuote"];
            };
        };
        responses: {
            /** @description Quote created */
            201: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Quote"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    createPaymentIntent: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreatePaymentIntent"];
            };
        };
        responses: {
            /** @description Intent created */
            201: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentIntent"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    getPaymentIntent: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                payment_intent_id: components["parameters"]["PaymentIntentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current intent */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentIntent"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    decideAuthorization: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                payment_intent_id: components["parameters"]["PaymentIntentId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    decision: "authorize" | "decline";
                    reason?: string;
                };
            };
        };
        responses: {
            /** @description Decision recorded */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentIntent"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    listTransactions: {
        parameters: {
            query?: {
                limit?: components["parameters"]["PageLimit"];
                /** @description Opaque cursor returned by the preceding page. */
                cursor?: components["parameters"]["PageCursor"];
            };
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Transactions ordered newest first */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionPage"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    getTransaction: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                transaction_id: components["parameters"]["TransactionId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Transaction detail */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TransactionView"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    submitDelivery: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                transaction_id: components["parameters"]["TransactionId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeliveryEvidence"];
            };
        };
        responses: {
            /** @description Delivery recorded */
            201: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        transaction: components["schemas"]["Transaction"];
                        delivery: components["schemas"]["DeliveryRecord"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    settleTransaction: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                transaction_id: components["parameters"]["TransactionId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Settled and receipt issued */
            201: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        transaction: components["schemas"]["Transaction"];
                        receipt: components["schemas"]["Receipt"];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    recoverTransactionSettlement: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                transaction_id: components["parameters"]["TransactionId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Recovery query recorded; the result remains unknown or settlement and Receipt are finalized */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettlementRecoveryResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    getReceipt: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                receipt_id: components["parameters"]["ReceiptId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Receipt */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Receipt"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    verifyReceipt: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                receipt_id: components["parameters"]["ReceiptId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Receipt verification result */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        receipt_id: string;
                        valid: boolean;
                        signature_valid: boolean;
                        issuer_trusted: boolean;
                        settlement_confirmed: boolean;
                        environment_valid: boolean;
                        environment_interpretation: components["schemas"]["ReceiptEnvironmentInterpretation"];
                        /** @enum {string} */
                        schema_version: "0.1" | "0.2" | "0.3";
                        /** @enum {string} */
                        canonicalization_version: "BU2-LEGACY-0.1" | "RFC8785-JCS-1";
                    };
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    createWebhookSubscription: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateWebhookSubscription"];
            };
        };
        responses: {
            /** @description Subscription metadata created; secret material is never returned */
            201: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookSubscription"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    rotateWebhookSecret: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                subscription_id: components["parameters"]["WebhookSubscriptionId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RotateWebhookSecret"];
            };
        };
        responses: {
            /** @description Rotation metadata created; secret material is never returned */
            201: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookSecretRotation"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    listWebhookDeadLetters: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Dead-lettered Outbox records */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookOutboxList"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    listWebhookDeliveryAttempts: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                outbox_id: components["parameters"]["WebhookOutboxId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Delivery attempts ordered by occurrence */
            200: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookDeliveryAttemptList"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    replayWebhook: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                outbox_id: components["parameters"]["WebhookOutboxId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReplayWebhook"];
            };
        };
        responses: {
            /** @description Replay audit record created and original event requeued */
            201: {
                headers: {
                    "X-Request-Id": components["headers"]["RequestId"];
                    "X-Trace-Id": components["headers"]["TraceId"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookReplay"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
}
