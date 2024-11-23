"use server";

import { client } from "@midday/engine/client";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authActionClient } from "../safe-action";

export const reconnectGoCardLessLinkAction = authActionClient
  .schema(
    z.object({
      id: z.string(),
      institutionId: z.string(),
      availableHistory: z.number(),
      isDesktop: z.boolean(),
      redirectTo: z.string(),
    }),
  )
  .metadata({
    name: "create-gocardless-link",
  })
  .action(
    async ({
      parsedInput: {
        id,
        institutionId,
        availableHistory,
        redirectTo,
        isDesktop,
      },
      ctx: { user },
    }) => {
      await client.institutions[":id"].usage.$put({
        param: {
          id: institutionId,
        },
      });

      const reference = `${user.team_id}_${nanoid()}`;

      const link = new URL(redirectTo);

      link.searchParams.append("id", id);

      if (isDesktop) {
        link.searchParams.append("desktop", "true");
      }

      const agreementResponse = await client.auth.gocardless.agreement.$post({
        json: {
          institutionId,
          transactionTotalDays: availableHistory,
        },
      });

      const { data: agreementData } = await agreementResponse.json();

      const linkResponse = await client.auth.gocardless.link.$post({
        json: {
          agreement: agreementData.id,
          institutionId,
          redirect: link.toString(),
          reference,
        },
      });

      const { data: linkData } = await linkResponse.json();

      if (!linkResponse.ok) {
        throw new Error("Failed to create link");
      }

      return redirect(linkData.link);
    },
  );
