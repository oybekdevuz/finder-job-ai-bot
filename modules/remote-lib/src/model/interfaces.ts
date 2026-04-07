export interface IStorageDataSchema {
  id: number;
  description: string;
}

type ToolValue = string | number | boolean;

export interface IElectricytyPayment {
    id: ToolValue;
    amount: ToolValue;
}

export interface IGasPayment {
    id: ToolValue;
    amount: ToolValue;
}

export interface IMobileOperatorPayment {
    id: ToolValue;
    amount: ToolValue;
    operator_name: ToolValue;
}

export interface IInternetPayment {
    id: ToolValue;
    provider_name: ToolValue;
    amount: ToolValue;
}

export interface IGovernmentPayment {
    id: ToolValue;
    amount: ToolValue;
    service_name: ToolValue;
}

export interface ICreditPayment {
    amount: ToolValue;
    bank_name: ToolValue;
}

export interface IOpenPage {
    open_page: ToolValue;
}