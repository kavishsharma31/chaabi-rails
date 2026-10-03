                text: JSON.stringify(
                  {
                    success: false,
                    error:
                      "Unsupported persistent-state operation.",
                    allowed_operations:
                      Array.from(
                        allowedOperations
                      ),
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        return forwardJson(
          "/agenticorg/state-worker",
          {
            task: JSON.stringify(
              normalizedTask
            ),
          }
        );
      }
    );

    // =========================================================
    // RENTAL TRUTH / PROPERTY PROFILE
    // =========================================================

    server.registerTool(
      "get_property_profile",
      {
        description:
          "Retrieve the persisted Rental Truth profile for a property by property_id. Use this before relying on previously known property availability or terms. Treat missing, contested or stale fields as unresolved rather than inventing values.",
        inputSchema: z.object({
          property_id: z
            .string()
            .min(1),
        }),
      },
      async ({ property_id }) => {
        return forwardJson(
          "/agenticorg/state-worker",
          {
            task: JSON.stringify({
              operation:
                "read_state_record",
              tab: "properties",
              key_field:
                "property_id",
              key_value:
                property_id,
            }),
          }
        );
      }
    );

    // =========================================================
    // AGREEMENT STATUS
    // =========================================================

    server.registerTool(
      "get_agreement_status",
      {
        description:
          "Retrieve verified agreement signature status before any held token is released. A token may be released only when this tool returns tenant_signed=true, owner_signed=true, status=fully_signed and release_eligible=true. Use the exact signing_reference returned by this tool; never invent one.",
        inputSchema: z.object({
          agreement_id: z
            .string()
            .min(1),
        }),
      },
      async ({ agreement_id }) => {
        return forwardJson(
          "/agreement/status",
          {
            agreement_id,
          }
        );
      }
    );

    return server;
  },
  {
    responseMode: "json",
  }
);

export async function POST(
  request: Request
) {
  return handler.fetch(request);
}

export async function GET(
  request: Request
) {
  return handler.fetch(request);
}

export async function DELETE(
  request: Request
) {
  return handler.fetch(request);
}