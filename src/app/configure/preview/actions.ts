"use server";

import { BASE_PRICE, PRODUCT_PRICES } from "@/config/product";
import { db } from "@/db";
import { stripe } from "@/lib/stripe";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { Order } from "@prisma/client";

export const createCheckoutSession = async ({
  configId,
}: {
  configId: string;
}) => {
  const configuration = await db.configuration.findUnique({
    where: {
      id: configId,
    },
  });

  if (!configuration) {
    throw new Error("no such configuration found!");
  }

  const { getUser } = getKindeServerSession();
  const user = await getUser();

  if (!user) throw new Error("you need to be logged in!");

  const { finish, material } = configuration;

  let totalPrice = BASE_PRICE;

  if (finish === "textured") totalPrice += PRODUCT_PRICES.finish.textured;
  if (material === "polycarbonate")
    totalPrice += PRODUCT_PRICES.material.polycarbonate;

  let order: Order | undefined = undefined;
  const existingOrder = await db.order.findFirst({
    where: {
      user_id: user.id,
      configuration_id: configuration.id,
    },
  });

  if (existingOrder) {
    order = existingOrder;
  } else {
    order = await db.order.create({
      data: {
        amount: totalPrice / 100,
        user_id: user.id,
        configuration_id: configuration.id,
      },
    });
  }

  const product = await stripe.products.create({
    name: "Custom iPhone case",
    images: [configuration.imageUrl],
    default_price_data: {
      currency: "USD",
      unit_amount: totalPrice,
    },
  });

  const stripeSession = await stripe.checkout.sessions.create({
    success_url: `${process.env.NEXT_PUBLIC_SERVER_URL}/thank-you?orderId=${order.id}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SERVER_URL}/configure/preview?id=${configuration.id}`,
    payment_method_types: ["card"],
    mode: "payment",
    shipping_address_collection: {
      allowed_countries: ["ID", "SG", "MY", "TH", "CH"],
    },
    metadata: {
      userId: user.id,
      orderId: order.id,
    },
    line_items: [{ price: product.default_price as string, quantity: 1 }],
  });

  return { url: stripeSession.url };
};
