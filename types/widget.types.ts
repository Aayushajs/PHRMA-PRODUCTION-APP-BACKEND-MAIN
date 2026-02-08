type WidgetType = "payment" | "featured" | "chatbot";

export type Widget = {
  type: WidgetType;
  title: string;
};
