import { createStateContext } from "react-use"

export type LoginHeroesState = {
  isPasswordEmpty: boolean
  isPasswordVisible: boolean
  isUsernameFocused: boolean
}

export const [useLoginHeroesContext, LoginHeroesProvider, LoginHeroesContext] =
  createStateContext<LoginHeroesState>({
    isPasswordEmpty: true,
    isPasswordVisible: false,
    isUsernameFocused: false,
  })
