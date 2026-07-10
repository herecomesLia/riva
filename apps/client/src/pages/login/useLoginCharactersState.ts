import { useState } from "react"

export function useLoginCharactersState() {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isUsernameFocused, setIsUsernameFocused] = useState(false)
  const [isPasswordEmpty, setIsPasswordEmpty] = useState(true)

  function handleUsernameFocus() {
    setIsUsernameFocused(true)
  }

  function handleUsernameBlur() {
    setIsUsernameFocused(false)
  }

  function handlePasswordChange(nextPassword: string) {
    setIsPasswordEmpty(nextPassword.length === 0)
  }

  return {
    charactersProps: {
      isPasswordEmpty,
      isUsernameFocused,
      isPasswordVisible,
    },
    formProps: {
      onPasswordChange: handlePasswordChange,
      onPasswordVisibilityChange: setIsPasswordVisible,
      onUsernameBlur: handleUsernameBlur,
      onUsernameFocus: handleUsernameFocus,
    },
  }
}
