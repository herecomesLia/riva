import { createStateContext } from "react-use"

export type LoginHerosState = {
  isPasswordEmpty: boolean
  isPasswordVisible: boolean
  isUsernameFocused: boolean
}

export const [useLoginHerosContext, LoginHerosProvider, LoginHerosContext] =
  createStateContext<LoginHerosState>({
    isPasswordEmpty: true,
    isPasswordVisible: false,
    isUsernameFocused: false,
  })
