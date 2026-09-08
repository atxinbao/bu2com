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
    "/budgets": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List configured budget scopes and current availability */
        get: operations["listBudgets"];
        put?: never;
        /** Create an active budget scope */
        post: operations["createBudget"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/budgets/{budget_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                budget_id: string;
            };
            cookie?: never;
        };
        /** Read one budget scope */
        get: operations["getBudget"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/budget_holds": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List budget holds */
        get: operations["listBudgetHolds"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/budget_holds/{budget_hold_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                budget_hold_id: string;
            };
            cookie?: never;
        };
        /** Read one budget hold */
        get: operations["getBudgetHold"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payment_mandates": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List versioned payment mandates */
        get: operations["listPaymentMandates"];
        put?: never;
        /** Create a draft payment mandate version */
        post: operations["createPaymentMandate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payment_mandates/{mandate_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                mandate_id: string;
            };
            cookie?: never;
        };
        /** Read one payment mandate */
        get: operations["getPaymentMandate"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/payment_mandates/{mandate_id}/{action}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                mandate_id: string;
                action: "activate" | "suspend" | "revoke" | "expire";
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Change payment mandate state */
        post: operations["transitionPaymentMandate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/execution_sessions": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List bounded internal Sandbox execution sessions */
        get: operations["listExecutionSessions"];
        put?: never;
        /** Create a bounded internal execution session request */
        post: operations["createExecutionSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/execution_sessions/{execution_session_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                execution_session_id: string;
            };
            cookie?: never;
        };
        /** Read one bounded execution session */
        get: operations["getExecutionSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/execution_sessions/{execution_session_id}/{action}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                execution_session_id: string;
                action: "activate" | "pause" | "complete" | "revoke" | "expire";
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve or change a bounded internal execution session */
        post: operations["transitionExecutionSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/financial_postings": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List immutable financial postings */
        get: operations["listFinancialPostings"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/provider_fees": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List immutable provider fee facts */
        get: operations["listProviderFees"];
        put?: never;
        /** Record one observed provider fee fact */
        post: operations["recordProviderFee"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/provider_fees/{provider_fee_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                provider_fee_id: string;
            };
            cookie?: never;
        };
        /** Read one provider fee fact */
        get: operations["getProviderFee"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reconciliations": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List immutable reconciliation runs */
        get: operations["listReconciliationRuns"];
        put?: never;
        /** Create a deterministic reconciliation run from persisted payment facts */
        post: operations["createReconciliation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/reconciliations/{reconciliation_run_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                reconciliation_run_id: string;
            };
            cookie?: never;
        };
        /** Read one reconciliation run */
        get: operations["getReconciliationRun"];
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
    "/receivables": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List account-owned receivables */
        get: operations["listReceivables"];
        put?: never;
        /** Create an account-owned receivable from an active quote */
        post: operations["createReceivable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/receivables/{receivable_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read one account-owned receivable */
        get: operations["getReceivable"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/receivables/{receivable_id}/collections": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                receivable_id: components["parameters"]["ReceivableId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Verify an inbound payment and post a receivable once */
        post: operations["verifyInboundPayment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collections": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List verified inbound collections */
        get: operations["listCollections"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collections/{collection_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                collection_id: components["parameters"]["CollectionId"];
            };
            cookie?: never;
        };
        /** Read one inbound collection */
        get: operations["getCollection"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collections/{collection_id}/access_grants": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                collection_id: components["parameters"]["CollectionId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Grant recoverable paid access from a posted Collection */
        post: operations["createAccessGrant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/access_grants": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List recoverable paid access grants */
        get: operations["listAccessGrants"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/access_grants/{access_grant_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                access_grant_id: components["parameters"]["AccessGrantId"];
            };
            cookie?: never;
        };
        /** Read one recoverable paid access grant */
        get: operations["getAccessGrant"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/access_grants/{access_grant_id}/recover": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                access_grant_id: components["parameters"]["AccessGrantId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Re-read and reactivate a paid access grant from its posted Collection */
        post: operations["recoverAccessGrant"];
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
    "/payment_intents/{payment_intent_id}/execution": {
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
        /** Execute an already approved payment intent without operator approval */
        post: operations["executePaymentIntent"];
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
    "/transactions/{transaction_id}/cancellations": {
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
        /** Cancel a reserved transaction and release its funds */
        post: operations["cancelTransaction"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/transactions/{transaction_id}/refunds": {
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
        /** Request a bounded full or partial refund */
        post: operations["requestTransactionRefund"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/refunds": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** List visible refund facts */
        get: operations["listRefunds"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/refunds/{refund_id}": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                refund_id: string;
            };
            cookie?: never;
        };
        /** Read a refund fact */
        get: operations["getRefund"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/refunds/{refund_id}/recoveries": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                refund_id: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Recover a provider-unknown refund without submitting a new refund */
        post: operations["recoverRefund"];
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
    "/access": {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        /** Read the authenticated principal and its bounded permissions */
        get: operations["getAccessIdentity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/support_bundles": {
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
        /** Create a redacted operator diagnostic bundle */
        post: operations["createSupportBundle"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/operations/tenants/{tenant_id}/resets": {
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
        /** Invalidate one Sandbox tenant credential generation without deleting financial facts */
        post: operations["resetTenantAccess"];
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
        CreatePaymentMandate: {
            id?: string;
            account_id: string;
            agent_id: string;
            funding_source_id: string;
            receiving_target_id: string;
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            currency: string;
            max_single_amount: number;
            daily_limit: number;
            monthly_limit: number;
            merchant_allowlist?: string[];
            merchant_denylist?: string[];
            category_allowlist?: string[];
            purpose_constraints?: {
                required_terms?: string[];
            };
            resource_constraints?: {
                [key: string]: unknown;
            };
            /** Format: date-time */
            effective_at: string;
            /** Format: date-time */
            expires_at?: string | null;
            created_by?: string | null;
            supersedes_mandate_id?: string;
        };
        MandateTransition: {
            version: number;
            reason?: string;
        };
        PaymentMandate: components["schemas"]["CreatePaymentMandate"] & {
            id: string;
            version: number;
            /** @enum {string} */
            status: "draft" | "active" | "suspended" | "revoked" | "expired";
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        CreateExecutionSession: {
            id?: string;
            tenant_id: string;
            account_id: string;
            agent_id: string;
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            purpose: string;
            max_spend: components["schemas"]["Amount"];
            /** Format: date-time */
            starts_at: string;
            /** Format: date-time */
            expires_at: string;
        };
        ExecutionSessionTransition: {
            version: number;
            activation_id?: string;
            approved_by?: string;
            reason?: string;
        };
        ExecutionSession: components["schemas"]["CreateExecutionSession"] & {
            id: string;
            reserved_spend_minor: number;
            committed_spend_minor: number;
            remaining_spend: components["schemas"]["Amount"];
            /** @enum {string} */
            status: "requested" | "active" | "paused" | "completed" | "expired" | "revoked";
            /** @enum {string} */
            activation_status: "pending" | "active" | "expired" | "revoked";
            activation_id: string | null;
            activation_reviewer?: string | null;
            activation_reason?: string | null;
            version: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        CreateBudget: {
            id?: string;
            /** @enum {string} */
            scope_type: "workspace" | "project" | "account" | "agent";
            scope_id: string;
            currency: string;
            /** @enum {string} */
            period: "lifetime" | "calendar_month" | "rolling_24h";
            limit_minor: number;
        };
        Budget: components["schemas"]["CreateBudget"] & {
            id: string;
            /** @enum {string} */
            status: "active" | "paused" | "exhausted" | "expired";
            version: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
            active_hold_total: number;
            consumed_total: number;
            available_minor: number;
            hold_count: number;
        };
        BudgetHold: {
            id: string;
            transaction_id: string;
            payment_intent_id: string;
            budget_id: string;
            amount_value: number;
            currency: string;
            /** @enum {string} */
            status: "active" | "consumed" | "released" | "expired";
            authorization_id: string;
            idempotency_key: string;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            released_at?: string | null;
            /** Format: date-time */
            consumed_at?: string | null;
        };
        FinancialPosting: {
            id: string;
            event_id: string;
            event_type: string;
            transaction_id?: string | null;
            budget_id?: string | null;
            source_id: string;
            /** @enum {string} */
            direction: "debit" | "credit";
            account: string;
            amount_value: number;
            currency: string;
            /** Format: date-time */
            created_at: string;
        };
        ProviderFeeInput: {
            id?: string;
            /** @enum {string} */
            source_type: "payment" | "collection" | "refund";
            source_id: string;
            provider: string;
            provider_reference: string;
            amount: components["schemas"]["Amount"];
            /** Format: date-time */
            observed_at?: string;
            metadata?: {
                [key: string]: string;
            };
        };
        ProviderFee: components["schemas"]["ProviderFeeInput"] & {
            id: string;
            account_id: string | null;
            agent_id: string | null;
            /** @enum {string} */
            status: "reported";
            /** Format: date-time */
            created_at: string;
        };
        ReconciliationInput: {
            id?: string;
            /** Format: date-time */
            as_of?: string;
        };
        ReconciliationItem: {
            /** @enum {string} */
            kind: "payment" | "collection" | "refund" | "fee";
            source_id: string;
            provider_reference: string | null;
            expected_amount: components["schemas"]["Amount"];
            observed_amount: components["schemas"]["Amount"] | null;
            /** @enum {string} */
            status: "matched" | "exception" | "unknown";
            issues: string[];
        };
        ReconciliationRun: {
            id: string;
            /** Format: date-time */
            as_of: string;
            /** @enum {string} */
            status: "matched" | "exception" | "unknown";
            item_count: number;
            exception_count: number;
            unknown_count: number;
            totals: {
                [key: string]: {
                    payments: number;
                    collections: number;
                    refunds: number;
                    fees: number;
                };
            };
            items: components["schemas"]["ReconciliationItem"][];
            /** Format: date-time */
            created_at: string;
        };
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
            api_contract_version: "0.3.0";
            mcp_contract_versions: "0.3.0"[];
            receipt_schema_versions: ("0.2" | "0.3")[];
            /** @enum {string} */
            execution_status: "execution_disabled" | "execution_enabled";
            /** @constant */
            access_contract_version: "1.0";
            /** @enum {string} */
            access_mode: "development_open" | "authenticated";
            public_capabilities: string[];
            receipt_issuer: components["schemas"]["ReceiptIssuer"];
        };
        AccessIdentity: {
            /** @enum {string} */
            mode: "development_open" | "authenticated";
            authenticated: boolean;
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            principal_id: string | null;
            tenant_id: string | null;
            /** @enum {string|null} */
            role: "agent" | "developer" | "operator" | null;
            permissions: string[];
            account_ids: string[];
            agent_ids: string[];
            credential_generation: number | null;
            /** @description Persisted Principal, Account and Agent ownership visible to the authenticated caller. */
            identity?: components["schemas"]["IdentitySummary"] | null;
            wallet_bindings?: components["schemas"]["WalletBindings"];
        };
        IdentityPrincipal: {
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            id: string;
            tenant_id: string;
            /** @enum {string} */
            kind: "human" | "service";
            display_name: string;
            /** @enum {string} */
            status: "active" | "disabled";
            generation: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        IdentityAccount: {
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            id: string;
            tenant_id: string;
            owner_principal_id: string;
            display_name: string;
            /** @enum {string} */
            status: "active" | "disabled";
            generation: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        IdentityAgent: {
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            id: string;
            tenant_id: string;
            owner_principal_id: string;
            display_name: string;
            /** @enum {string} */
            status: "active" | "disabled";
            generation: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        IdentitySummary: {
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            tenant_id: string;
            principal: components["schemas"]["IdentityPrincipal"];
            accounts: components["schemas"]["IdentityAccount"][];
            agents: components["schemas"]["IdentityAgent"][];
            funding_sources?: components["schemas"]["FundingSourceBinding"][];
            receiving_targets?: components["schemas"]["ReceivingTargetBinding"][];
        };
        FundingSourceBinding: {
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            id: string;
            tenant_id: string;
            account_id: string;
            agent_id: string | null;
            asset: string;
            network: string | null;
            provider: string;
            source_reference: string;
            /** @enum {string} */
            status: "active" | "disabled" | "revoked";
            /** @enum {string} */
            verification_status: "pending" | "verified" | "failed" | "revoked";
            generation: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        ReceivingTargetBinding: {
            /** @enum {string} */
            environment: "local" | "sandbox" | "live";
            id: string;
            tenant_id: string;
            account_id: string;
            agent_id: string | null;
            asset: string;
            network: string | null;
            provider: string;
            target_reference: string;
            /** @enum {string} */
            status: "active" | "disabled" | "revoked";
            /** @enum {string} */
            verification_status: "pending" | "verified" | "failed" | "revoked";
            generation: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        WalletBindings: {
            funding_sources: components["schemas"]["FundingSourceBinding"][];
            receiving_targets: components["schemas"]["ReceivingTargetBinding"][];
        };
        CreateSupportBundle: {
            reason: string;
            transaction_id?: string;
            request_id?: string;
            trace_id?: string;
        };
        SupportBundle: {
            id: string;
            /** @constant */
            schema_version: "1.0";
            /** Format: date-time */
            generated_at: string;
            requested_by: string;
            reason: string;
            environment: {
                [key: string]: unknown;
            };
            service: {
                [key: string]: unknown;
            };
            correlation: {
                [key: string]: unknown;
            };
            diagnostics: {
                [key: string]: unknown;
            };
            transaction: {
                [key: string]: unknown;
            } | null;
            redaction: {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        };
        TenantAccessResetRequest: {
            reason: string;
        };
        TenantAccessReset: {
            id: string;
            /** @enum {string} */
            environment: "sandbox";
            target_tenant_id: string;
            previous_generation: number;
            new_generation: number;
            requested_by: string;
            reason: string;
            request_id: string;
            trace_id: string;
            /** Format: date-time */
            created_at: string;
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
            asset?: string;
            network?: string;
            receiving_target_id?: string;
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
            receiving_target_binding_id?: string | null;
            /** Format: date-time */
            created_at: string;
        };
        CreateReceivable: {
            id?: string;
            quote_id: string;
            account_id: string;
            agent_id: string;
            receiving_target_id: string;
            /** Format: date-time */
            expires_at: string;
            purpose: string;
            expected_payer_account_id?: string;
            expected_buyer_agent_id?: string;
            metadata?: {
                [key: string]: string;
            };
        };
        Receivable: components["schemas"]["CreateReceivable"] & {
            id: string;
            receiving_target_binding_id?: string | null;
            amount: components["schemas"]["Amount"];
            asset?: string | null;
            network?: string | null;
            collection_reference: string;
            /** @enum {string} */
            status: "issued" | "pending" | "paid" | "expired" | "cancelled";
            version: number;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
            collection_id?: string | null;
            /** Format: date-time */
            paid_at?: string | null;
        };
        VerifyInboundPayment: {
            provider_reference: string;
            collection_reference: string;
            amount?: components["schemas"]["Amount"];
            asset?: string;
            network?: string;
            payer_account_id?: string;
            payer_agent_id?: string;
        };
        CollectionVerificationAttempt: {
            id: string;
            collection_id: string;
            receivable_id: string;
            provider: string;
            provider_reference: string;
            /** @enum {string} */
            status: "pending" | "verified";
            amount: components["schemas"]["Amount"];
            asset?: string | null;
            network?: string | null;
            payer_account_id?: string | null;
            payer_agent_id?: string | null;
            /** @enum {string} */
            verification_mode: "simulation" | "provider";
            /** Format: date-time */
            observed_at: string;
            /** Format: date-time */
            created_at: string;
        };
        Collection: {
            id: string;
            receivable_id: string;
            account_id: string;
            agent_id: string;
            receiving_target_id: string;
            collection_reference: string;
            provider: string;
            provider_reference: string;
            amount: components["schemas"]["Amount"];
            asset?: string | null;
            network?: string | null;
            payer_account_id?: string | null;
            payer_agent_id?: string | null;
            /** @enum {string} */
            verification_status: "pending" | "verified";
            /** @enum {string} */
            status: "pending" | "posted";
            /** @enum {string} */
            verification_mode: "simulation" | "provider";
            /** Format: date-time */
            verified_at: string;
            /** Format: date-time */
            last_observed_at?: string;
            late?: boolean;
            fulfillment_eligible?: boolean;
            verification_attempts?: components["schemas"]["CollectionVerificationAttempt"][];
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
        };
        VerifyInboundPaymentResult: {
            collection: components["schemas"]["Collection"];
            receivable: components["schemas"]["Receivable"];
        };
        CreateAccessGrant: {
            id?: string;
            access_type: string;
            access_reference: string;
            /** Format: date-time */
            expires_at?: string | null;
            metadata?: {
                [key: string]: string;
            };
        };
        RecoverAccessGrant: Record<string, never>;
        AccessGrant: {
            id: string;
            collection_id: string;
            receivable_id: string;
            account_id: string;
            agent_id: string;
            access_type: string;
            access_reference: string;
            /** @enum {string} */
            status: "active" | "expired" | "revoked";
            /** @enum {string} */
            source_type: "collection";
            source_id: string;
            /** Format: date-time */
            expires_at: string | null;
            metadata: {
                [key: string]: string;
            };
            version: number;
            /** Format: date-time */
            granted_at: string;
            /** Format: date-time */
            recovered_at: string | null;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            updated_at: string;
            /** @enum {string|null} */
            collection_status?: "pending" | "posted" | null;
            /** @enum {string|null} */
            collection_verification_status?: "pending" | "verified" | null;
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
            /**
             * @description 可选；未提供时默认为 immediate。
             * @enum {string}
             */
            execution_mode?: "immediate" | "deferred";
            asset?: string;
            network?: string;
            funding_source_id?: string;
            receiving_target_id?: string;
            budget_id?: string;
            execution_session_id?: string;
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
            policy_decision_id?: string;
            mandate_version?: number;
        };
        PolicyDecision: {
            id: string;
            /** @enum {string} */
            decision: "approved" | "review_required" | "denied";
            mandate_id: string;
            mandate_version: number;
            request_fingerprint: string;
            input_snapshot: {
                [key: string]: unknown;
            };
            matched_rules: string[];
            reason_codes: string[];
            budget_context?: {
                [key: string]: unknown;
            } | null;
            /** Format: date-time */
            effective_until?: string | null;
            idempotency_key: string;
            /** Format: date-time */
            created_at: string;
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
            /** @enum {string} */
            execution_mode?: "immediate" | "deferred";
            external_context?: components["schemas"]["ExternalContext"];
            metadata?: {
                [key: string]: string;
            };
            /** @enum {string} */
            status: "requires_authorization" | "authorized" | "funds_reserved" | "delivery_submitted" | "settled" | "declined" | "expired" | "canceled" | "refunded" | "disputed";
            transaction_id: string | null;
            authorization: components["schemas"]["Authorization"];
            policy_decision?: components["schemas"]["PolicyDecision"];
            funding_source_binding_id?: string | null;
            receiving_target_binding_id?: string | null;
            budget_id?: string | null;
            execution_session_id?: string | null;
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
            execution_session_id?: string | null;
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
            execution_session: components["schemas"]["ExecutionSession"] | null;
            quote: components["schemas"]["Quote"] | null;
            delivery: components["schemas"]["DeliveryRecord"] | null;
            receipt: components["schemas"]["Receipt"] | null;
            refunds: components["schemas"]["Refund"][];
            cancellation: components["schemas"]["Cancellation"] | null;
            payment_channel: string;
            settlement_control: components["schemas"]["SettlementControl"] | null;
        };
        Cancellation: {
            reason?: string | null;
            /** @enum {string} */
            status?: "canceled";
            provider_reference?: string | null;
            /** Format: date-time */
            canceled_at?: string | null;
        };
        CancellationResult: {
            transaction: components["schemas"]["Transaction"];
            cancellation: components["schemas"]["Cancellation"];
        };
        RefundRequest: {
            amount: components["schemas"]["Amount"];
            reason?: string | null;
        };
        Refund: {
            id: string;
            transaction_id: string;
            payment_intent_id: string;
            amount: components["schemas"]["Amount"];
            /** @enum {string} */
            status: "processing" | "refunded" | "provider_unknown";
            reason: string | null;
            provider_reference: string | null;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            refunded_at: string | null;
            recovery_required: boolean;
            failure_reason?: string | null;
        };
        RefundResult: {
            transaction: components["schemas"]["Transaction"];
            refund: components["schemas"]["Refund"];
            recovery?: {
                /** @enum {string} */
                status?: "refunded" | "provider_unknown";
                reason_code?: string | null;
            };
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
        /** @description Missing, invalid, expired, revoked, or reset bearer credential */
        Unauthorized: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Trace-Id": components["headers"]["TraceId"];
                "WWW-Authenticate"?: string;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Authenticated principal lacks the permission or resource claim */
        Forbidden: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Trace-Id": components["headers"]["TraceId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
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
        /** @description Provider returned an unverifiable or invalid payment result */
        UnprocessableEntity: {
            headers: {
                "X-Request-Id": components["headers"]["RequestId"];
                "X-Trace-Id": components["headers"]["TraceId"];
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Inbound verification provider is unavailable or unsupported */
        ServiceUnavailable: {
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
        ReceivableId: string;
        CollectionId: string;
        AccessGrantId: string;
        TenantId: string;
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
    listBudgets: {
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
            /** @description Budget scopes */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Budget"][];
                    };
                };
            };
        };
    };
    createBudget: {
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
                "application/json": components["schemas"]["CreateBudget"];
            };
        };
        responses: {
            /** @description Budget created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Budget"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    getBudget: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                budget_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Budget scope */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Budget"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    listBudgetHolds: {
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
            /** @description Budget holds */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["BudgetHold"][];
                    };
                };
            };
        };
    };
    getBudgetHold: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                budget_hold_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Budget hold */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BudgetHold"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    listPaymentMandates: {
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
            /** @description Payment mandates */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["PaymentMandate"][];
                    };
                };
            };
        };
    };
    createPaymentMandate: {
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
                "application/json": components["schemas"]["CreatePaymentMandate"];
            };
        };
        responses: {
            /** @description Draft payment mandate */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMandate"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    getPaymentMandate: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                mandate_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Payment mandate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMandate"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    transitionPaymentMandate: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                mandate_id: string;
                action: "activate" | "suspend" | "revoke" | "expire";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MandateTransition"];
            };
        };
        responses: {
            /** @description Updated payment mandate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentMandate"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    listExecutionSessions: {
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
            /** @description Execution sessions visible to the caller */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["ExecutionSession"][];
                    };
                };
            };
        };
    };
    createExecutionSession: {
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
                "application/json": components["schemas"]["CreateExecutionSession"];
            };
        };
        responses: {
            /** @description Requested execution session */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExecutionSession"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    getExecutionSession: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                execution_session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Execution session */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExecutionSession"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    transitionExecutionSession: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                execution_session_id: string;
                action: "activate" | "pause" | "complete" | "revoke" | "expire";
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ExecutionSessionTransition"];
            };
        };
        responses: {
            /** @description Updated execution session */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExecutionSession"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    listFinancialPostings: {
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
            /** @description Financial postings */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["FinancialPosting"][];
                    };
                };
            };
        };
    };
    listProviderFees: {
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
            /** @description Provider fee facts visible to the current operator */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["ProviderFee"][];
                    };
                };
            };
        };
    };
    recordProviderFee: {
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
                "application/json": components["schemas"]["ProviderFeeInput"];
            };
        };
        responses: {
            /** @description Provider fee fact recorded */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProviderFee"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    getProviderFee: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                provider_fee_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Provider fee fact */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProviderFee"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    listReconciliationRuns: {
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
            /** @description Reconciliation runs */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["ReconciliationRun"][];
                    };
                };
            };
        };
    };
    createReconciliation: {
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
                "application/json": components["schemas"]["ReconciliationInput"];
            };
        };
        responses: {
            /** @description Reconciliation run */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReconciliationRun"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    getReconciliationRun: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                reconciliation_run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Reconciliation run */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReconciliationRun"];
                };
            };
            404: components["responses"]["NotFound"];
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
    listReceivables: {
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
            /** @description Receivables visible to the current account or Agent */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Receivable"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    createReceivable: {
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
                "application/json": components["schemas"]["CreateReceivable"];
            };
        };
        responses: {
            /** @description Receivable created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Receivable"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["RequestTooLarge"];
            415: components["responses"]["UnsupportedMediaType"];
        };
    };
    getReceivable: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                receivable_id: components["parameters"]["ReceivableId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current receivable */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Receivable"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    verifyInboundPayment: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                receivable_id: components["parameters"]["ReceivableId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyInboundPayment"];
            };
        };
        responses: {
            /** @description Inbound payment verification result */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerifyInboundPaymentResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            422: components["responses"]["UnprocessableEntity"];
            503: components["responses"]["ServiceUnavailable"];
        };
    };
    listCollections: {
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
            /** @description Collections visible to the current account or Agent */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Collection"][];
                    };
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    getCollection: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                collection_id: components["parameters"]["CollectionId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current inbound collection */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Collection"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
        };
    };
    createAccessGrant: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                collection_id: components["parameters"]["CollectionId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateAccessGrant"];
            };
        };
        responses: {
            /** @description Access grant created or replayed */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessGrant"];
                };
            };
            400: components["responses"]["BadRequest"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
        };
    };
    listAccessGrants: {
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
            /** @description Access grants visible to the current account or Agent */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["AccessGrant"][];
                    };
                };
            };
        };
    };
    getAccessGrant: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                access_grant_id: components["parameters"]["AccessGrantId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Access grant */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessGrant"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    recoverAccessGrant: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                access_grant_id: components["parameters"]["AccessGrantId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecoverAccessGrant"];
            };
        };
        responses: {
            /** @description Recovered access grant */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessGrant"];
                };
            };
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
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
    executePaymentIntent: {
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
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Executed or previously reserved payment intent */
            200: {
                headers: {
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
    cancelTransaction: {
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
                "application/json": components["schemas"]["Cancellation"];
            };
        };
        responses: {
            /** @description Canceled transaction */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CancellationResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    requestTransactionRefund: {
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
                "application/json": components["schemas"]["RefundRequest"];
            };
        };
        responses: {
            /** @description Refund fact or provider-unknown recovery requirement */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RefundResult"];
                };
            };
            400: components["responses"]["BadRequest"];
            409: components["responses"]["Conflict"];
        };
    };
    listRefunds: {
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
            /** @description Refund facts */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: components["schemas"]["Refund"][];
                    };
                };
            };
        };
    };
    getRefund: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path: {
                refund_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Refund fact */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Refund"];
                };
            };
            404: components["responses"]["NotFound"];
        };
    };
    recoverRefund: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                refund_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Refund recovery result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RefundResult"];
                };
            };
            409: components["responses"]["Conflict"];
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
    getAccessIdentity: {
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
            /** @description Current access identity without credential material */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AccessIdentity"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    createSupportBundle: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateSupportBundle"];
            };
        };
        responses: {
            /** @description Redacted support bundle */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SupportBundle"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
        };
    };
    resetTenantAccess: {
        parameters: {
            query?: never;
            header: {
                /** @description Optional caller-supplied trace identifier; BU2 generates one when omitted. */
                "X-Trace-Id"?: components["parameters"]["TraceId"];
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path: {
                tenant_id: components["parameters"]["TenantId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TenantAccessResetRequest"];
            };
        };
        responses: {
            /** @description Tenant access reset audit result */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TenantAccessReset"];
                };
            };
            400: components["responses"]["BadRequest"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            409: components["responses"]["Conflict"];
        };
    };
}
