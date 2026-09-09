/**
 * Arma el documento .html autocontenido que se descarga: el CSS y
 * editable-view.js quedan inline, así el archivo abre suelto (doble clic,
 * sin servidor) y sigue siendo editable — mismo motor de interacción que
 * la vista en vivo, auto-inicializado con un bootstrap al cargar.
 *
 * Sólo arma el string del documento; quien lo llama se encarga de
 * conseguir el CSS/JS (fetch) y de disparar la descarga.
 */

(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.ExportHtml = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  // Isotipo real de Megalabs embebido en base64 (mismo archivo que
  // assets/megalabs-logo.png) para que el .html exportado sea 100%
  // autocontenido, sin depender de este sitio para mostrar el logo.
  const MEGALABS_LOGO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYcAAACLCAYAAAH9rGUnAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAIdUAACHVAQSctJ0AACCHSURBVHhe7Z0LvCVFfed7EFGIIsE3srpgjICvz4qLaJg5RMUgy+KqXDY4w9w5XXVuCDrLjsPA3Lld1XeMJroJicB9zBiTVROMIZtVI0R3I9m8dBOzKpEVo+ADFQTxgUF5DK/0v0/VOVV1/v0659yZc+/8vp/P73O6/4+qfndXdZ/uCABwsLFn96O51gzhzKSdR3NZ3OEmFOUNW16PcAKJy7cd7s2IG+MOJxufz/rKxu1vaC8br6ROsBsTDltcO8ENuzYitBfFVUIJbtLS6Y/2ZHELJ+284MnRtnMPz4eVvK0ntxwbm3Ye6dndXy2/z9otNOyOV2KDuRkgyirR8pFIi1/tjSftl/SGSTbW/k5Fj2Ht7u9su5X/2vHaFM1AU9KZp3R/m07ApKDlTfnEd2dgXdcIAAAAANDHtupWbctu6qTDzFAfrmVnGfbCTottZshnLBeKXCHcTNg4brjOeCqT3EZY23Z5nBeTX9a339Ibr8Xc5udWJuza+Mxo9pefnseo+Ppori168VW/Fhp3Z8KS251YGk7kdwfyKwkLCtsU1ufGub+2VWfHw18t/7n7azYnLR8y9hvyXxtL2GEtr/LsldiCrjztF9iGkS3Mxtlh+0trU4mHe+P2d2rqMG9cxb+Yby40nMoPZjO13B02UmYNUIzNaQw3A8My1ARMCnapruqZAAAAAAAAa4g0PdQMgf2K24tj5RKOc6Tyw7lCUnltrv0FtYybNHEmoklUdyL6K6jbug6x5YRlufZU/oux9lGdL+Q+Fd9qLD5KfMPknmcsXdKNx3plXzx9lPFkPpnkNhctr+7FKnGPsXaxdnc4nXl2Pt5nXd+Xaebkxxr7GEhN94RVFB3SdRSwnH6zcM+gfCUedMrqYseL7C6uLfQrefOAzcX1cSsixIs3w62ofzjm/CuIv5aHrSyJ7+nlzm15VT6sxOe8MlPx51751sfJ9bu4Ni3/rDfuiuBWRBhn5fpcQpsdJ1EP6dhxKyBZrjjlSK9vzWqhtc9E9Alz3fJCu+481Bt2fSGc39q03Fjoy4fljOd3fRYvvsIfUuYbGSpYix/mw9wKIBXBTVgdmx0PRWjxR6yPRHB26ra2uPZw3LVbOL/d8jkf6aDloF8ABwIt/7e39eXKLi4AAAAAAAAAAAAAAABg9XLN1GOiNC2/bQpWiOV03nlAoKultPvo/N7LnpT/ghUmXAEkd4+g8aV08BapS9GjNFr8cWa/NtLxDmNZeez9i7pQrJJfM2MHiDoTbFfO4vwfG8sgduaTgkdV6tQzLprWR7ETsSKqJnrvzGN7K6MIW05YVpGdSMWZfX/8y8baR4u53Kc7f2MsfbT4Yi839Fu7i7WREnm2sXYhG62IRL47H7b37l0S8Yf9/PhDxjombMG5WuWPWNoVsZy+3Vj6eOVksqTiFNZOuHZXFs6nxE+Nl/dbwnEtpr240M/5SBbON5NtnGMjLLyKor3C5qv4K/mvFlOe3Q4nYjYfJvJ4+YAZ82Ptw2SJ/GA+Trh+DtffJJYIx1Xn+nxcyY/k46GfaFVsuI2wFXAVFVG2IuoOqy3ru+MXPi0fJ1Ih2VgLZ3Nx/VWx9vFLCw0n4k4z1iUvQ36vP5zHnJiPjx1bgdXON/+s8TTD5tceluf1xkPlfmfYEtrseCjX5+LGhH4a1p07zFgXN+bi1x/VG7e2seIWTlJip/F02XvyEYMPmrW6hx0Xm+8OJ9lhh34vmX6GZ8+HzYqgv/q6b7Vy/wNtYy1evhkmJZQXPt7pDBN2nESHPS3uH/DTW7JcbLyLtYX2seAWnspXGWuzp/0oV8efzIcvmnqCV6bFHU/if5cPz8WvzcdDwlzCtTX103Ai7jJjdAXUXXEWGg6vlHKb9PcSImm/P/e5+WPBFuoWzK0A0pWt15gIH8rV8nwzxpdZNK7kO/LXoqnOjVkZ3ZZ83gjMfHZcxZd4+e4wYcer/Jai8TTe4o+LF+fjWv4k/yXsiZw0dtyCuRVAWmh9NfeHzMXPyXN3bX6WsfTL0/FnjWVw5ntvJwhk4XwkYnb6hEIfQZe5rs2NcWVR8cdL/WW+sZO2j89/uZWw0tBbEIugFU2s+AKoQVVb66BgElbEQYld8KHAfiZcAfbNOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADMEe9ereH02LtJT2X9cNwJqD2+g5Lc/fbDL6kH0p/aIZA2CNsDd9SrQ0/7nexr+U/ln0vh1PNN5ibHw3Z7gzR/hOiVzTpxovz0B8prWG/brVSs2fW/YBf3vMgSQR7x3bQl6av8/bKUhNcVeMqyJ0vJeNV+IME7E2sN9Usho3btkH7Q6h4rd5C4IUvjekKeEO0WSnsC8r4KTk/zJRPlysVREqfhMbH6rotSX0Vz8u3pWSXzLRPlwsp5A6O0TSPtuLKZIWv2Iy+vj+73jjnDhUfBcbG2qsb18aJ9zEWo0CvYzO3SHqXj5x0+EqJPTH5zzRt4mjTWQfz2+k5I+zjeCdhRu6ZVf8MtZfquDv89ZOdeWfVpSfz+q/ka1bxx81WVlejR3CvjqM3veQl58d6fPyK+aL4PxVcuH8NB1Wrn0id4hLg4+AhqJ38ozK8vzvNjpLuPXPxVsHbCQLLVTOx9ksc53ner7Z9knG46PFshdncW2uPaRuHEdR7jgumZK4+8FYrgzXHvpc3Bglvmyso83zRLCr88yBmQi1P1Gdf2DrDo8u9uu9ro1kKbITSr7e8+VfFBafHVB+ZHXiLK7NtYfUiUu2PC/b8f48qyubb7f+gtymO4SSS9my+4xXNr00rKgM16463zbWQdw4ejGZi+vrxTBfcp5YuBlwpaZPNpHVLK6/hH3zEGlhQ//toUWEdbuEvtnNL/bGtbjFRGY7+vSpno8+XGxJ5GbPV1eWIntIUZyW1wz4qmSps0O4/jpyce3c63AtbhyJIzyIWSl5n4mYUFT8H9gJt1JCm8hBrmrtYzd+TnVw69Xm5Z8WFZzqQ4W4PhX/trHSUfOXPJ/7EtQ6eLmZiuDiks0v8GxFR043hmSp6nZ1fZyfUPJPC2Nceyq/aayDuHF1NnB+53iv8U4gRe9wJm3f5G8wixveyG7wZaqLWy81cENcvysVX2Qi+oQxlqmpwzy7+3rmOqRin5dfhBtj49SWYGfsnJPbQ/yYfh2J2MTaLa6P8xNlMWU+yzZxtBej5Q3GU42bR5p4wgl2Jzo96TB2Yy/TYuvrJrsebr30StKQOfdt+444ymIS+eMBf5VcOH+VLJyvVJtPMZld2JhMhI6/zvqK5H4hn6Av3HNxZXLh/EUK2x4TTZKdBmmid5zTvTO9sP5GdoMv0kJrW57XhDR+obfAZs4+wnh83BiS2z5wGYwbJGnXa0/siI8xGX1U/Ao2lkT3LkKbz7rsUvTBgRhPYt7EDqLj273YcMOm+zWuP5QS3zCRPNPTj4+SuPg+i32TeIjufJ6NdzWOnssDyjV0Zmg9zG74Pa2/0kQDS7ghALBmmRPtrNF5rBnzSbOzSbgzuG98B2DNoeVNAxt9kXR8sckC4CCAHsvYeubjcuELBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKwtHo3WRWl6aHTN1GOMBYCDBNrol+dv874RzWkKOwdYy3AbPaf37n6Dychy1KvNEABrgOX0t9iNntMV6ZEmq8tyem1u3zuJX5QHoAlL88sDGzynxfRtJsNnz/z/6cV8YOeTjbU5WlwepfLDfYnqT62m8lpPa5HwoynjZCXLXtXQkX1596X9HSC9N1pSb8ob0GUspe/p52QalnDFVK0c7nvYa5GVnMeVLHtVkcTPj4o+8t2Eq5IXeTvDsDtEuGKqVg4XH345cy0QzuM4WcmyVxV2AShxq7EMT7gzLM3/wHjqkYr/4q0UKx1vNRGDcPGktcZKzt9Klr1q0PIz3kLQYrvxDMdS+sjADtEEJX7qTY+rIrhYUh1UvJCfRdy8JGun1CEVp0RKXtfLV/K72fAV0Y64+93tIrT4Ha8+q/ybzfFFJmqQMJ4jkWdn5dw5EEvS8moTNUgYS2w79/CB9aHEe3JfGUn8n7Jlc7eXR9JkE280URNIOMGkog+U1+Gds08d2BmW579rvNVw02PFoeUdbCxpZ/t4EzVI5cfMM9HK40jl29j4UNxyTKcfz8aGUvKvTUafMIYjjOHEXUIOxnxrwOZKi2mT2Yd2Hi6W08TRah3KTihpFJZ3PziwQ9SFmxYr+vJmCBdnpcVXTZQPF1sk+iSuy6XiRDauSCHpzBFsHCct/spkdQn9HGFMmVw4f5V2bX6Wye7CxRRp4lCdL7ATShqVYXaGVP68Nw2XtV/ijZNCQn+oEOosCGO0fCTT72b1fyofDv0uoa+OXOzOQPUokV0WyW9m+nx2JnhgII/kUuazkN2WreR9edmpuIWdL7rMswz4HLG5RpadFzx5wEd5rlzfxOFOXCi6jBgVd2dYTl5irMWk8v3eNOQ2Z9zaLErMez4V/0nW0N7n2UJcX67ssiUkkS/wYtSW1xtP+fRY6sQUEbZfXFx76KtDkl2vu/mJ02Hi2kla3G88PmGcJdl8jmffKU82nkHS9owZmiDciec0DuzOsDT/m8ZSDFc/Z7NwPpU1EkObi+vj/BY3RscfNVbfruILjdVHyRu9uCZo0fZy0wufZjz1p72MojIG7Xy7cTCuS7I5OIDIJeNZJbgTz2lX/DITORrL6XzWiP4jM1ZMWD+h5G95Ni0+kNsJ104i5jYd59lm20/N7RbXRyrCi8sa6RbXrjovN1afVJ7nxTVBxa/wcunS0eLZMw1DURlF9hAVf6UwzrWTijogJpJw4kMp8Q0TuX9w69Zin7EG9uzak7hUHuvZlfxRbidceyKvMNYuri+X+CwvL+Zekx2U3XmRsfqk8mwvrohUJtnG9em8PiU+l/9Sg93NTbe81EQPTnsZqTgrK+tT3TI7/y//HZgvp4wie0gq/rIwLhF3eT6rJGv7TTzchIfan7j1anmNsfIrinqKXNvOdv8o7drDHdr11ZXbK+X5Zk4wVp+qncH1Vco5O4c+DlWwQRbJUmQPUZ3rgjj/csr1udLOAWUiob5sbsJd1WWh9YRoYcND0dLpWfuAURWz4ulBvYd0HRk6vt3zJRsHe4RcmvjqKBHvNNlBfsHOoOX5XpyLa6+lBjtD2inu9SmSpcgeosTH/Ni0v54sSdAR4mr7pp8xURMIN8GuqlhovYvd+ENVocQZhfXOTp/g+ehOrztOcmniU/K2Srk7pptbdJlUtDMU3cii58Ly7k/xxcGYmjvD1NRhA34S9U7RYzZKfikbzi6XAr+lyB5SdWZwceNczRYcRA443MS6KmJpw3p2o+e0sOF6k1VMEn+otF7XF0qJvzBRXbT8ied3ce2hrw5evnM971K0M7g21+4SNqDd623XTnJJ5O/7fqGNx8eLyWQpsodoeUOtOIvKpsONr5t3QAj76kNxLG64g93oi1QHajCX1ev6QoUkWTuhyO/aQ18d3Ny5eIOx+qTirV6cxbW5dpc03uLFJOJE4ynPL/O5FMUV2UPKDjTFrPNySMkW/qx6wAkn1FUIt7GX6arWp01mOVX1qvaegRirEDpTFPlde67WocZTDzdXdW42Vh8t/DaOxbW5dhctv+/HTR9lPOX5mu5ke77Ba3luo7Ro+XeePWlvNh4fN4ZUl1m53svTncuNZ8IoesBKd75nIrostB5hN/gy1SWsmyOMsQrRckehPxX3ez5SIh7Ij/Jz8XOyHemMrC3wvqwMutZ+OPN3u3ItYa6Of2g83We9uAcALaE97GG5NDtahjEuoU/LtxhPFM11XjPgDwn9aXZpZQk7MEju9O2K35TVV/yoCg3nj4DEC9mY346YOfuIgVzdGXzQb2JQ4lJvYknu0WGpdS+7sZepCWHdHGEMKbypRqh2y48Lejw8Xw25cBtElSy6cwHrL5NL/qxRSQznK1PdbtEi0dnawvnLNPHQs+rcBC+sfyu7sZepKW69bt0uCbMxcKTxMX7cpv4jDYSWG31/hUK4mDK5cP4iXTb1JJPVh4uzqPavs35OWvyzyfLhYjmFz65xMUXS8R+YrAmHei9ogumUZ+E29jINQ7jAiqgTt+1U/7KPHtHgUPJrXhwn6pLkSJjuXRL1ttAfpFxbiIrf4flDcf83sFwy/YyBeBe61Av9oVT7dSaaR4kr2Twr7r8MyZbnsbGhJrbhXEa6sfsamKtaN7EbPKsN5+Q5q5Xu/yW4hmc5c/K43vIiqnaGg4WmnRMTz0LrfH7Dd3T5qUebaEBo+RvYGQAghuuLB2AVotovL3y/rJKf8HYE7AxgTRNu7GVS4h6TBcAahNvoiwTAmobb6EOpTvH7jwBYc6TRIVE6dVi0devj8l8aBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHCQs5S+Ktq7+/3RnvSGaGn3fdGe3Y+yWkofyfT1bPjj0fK8iNL0MFMCAACAVc1y+sHsBPDAwIF/WC2rN5iSAQAArBqu2nFMdjJ4kD2wj6Ir544zNQyymO7JWxmLequxAAAAOOBcM/WY7OB8C3tQH1ZL6b5oj542NZSzPP/pgfwrZp9qvABMLlpsi9LOo4WaZLjptVLyayYKgGhdtCfdlR2obx44UNcRHeAX0rNMWc1Ynv8IW+ae3Q9HV/zac03U/iGdfnyk5SPsDuNqFNKzj2DLdEXTACYfnBzAmkPLd0czM481YweWpVQyJ4a+lufvjKay1s3+QImPsTtLKC0/YzKao8RdbJkDkr9vMsCkgpMDWFMo8XBvI9DyJ1GaHmo8Bw7upBBqMX2liV4Ztp75OG8HqdLcln9jMuujpn+BLYsTtR6mpvCE1ySjO7PsurOaZLjptcLJ4SCkqMtEiS+biAPDQnoue0IItaA3mozxo+Rfs8umUOJek1kfJe/jyyqQkntMJhiNQ7KW2LFRsvkF0SWbnxtt23a4sY9GKhN2vVmNg3TrkdHO9vH5tNM8RNF4WtHc9FpVnRzSjUeaof3HbPup0fZNx0Wz4unGAsbCtnMPLzwxuNp5wZNNxv5nb/op9oQQajF9o8kYH3SvgVseVVKy/qO5qnMRW0aVhmXm5MdmB5Nr2TLrKsm7ttZ1C2wAtcJUfD1bZh0p+UCUxM83pdWDuh65spqK6r5s+t+aUssZ18mB6uPym0qLv4zSmq1NLt/Knhy0+E3WX6ZE3BltP+Nn8vwmqHiBLa+ptPyX/dYNvSbQ8T52QXJS8r+arP3P0u5PsCeEUONe+brzSXZZVCnJDiR1oOnV8iG2jErJJVNKPbSY5ssZVTNHmBqKGdcO7opaWxe//ihTQzE0fVz+KNKdr5vSecZ1cliJdabEvCmdh8sZt5L4HFNbMVp8h80dRZNyP3XiUWInuwDLpOXVJnv/s6Sn2BOCp/nx9olyy8BKyztYu5UW7zSlFKPEf2dzrbT8FmsnqfinppRqdOd7bBnjUtJ5kalpEPde1kooke83NfGsxMmhp5lnm1p8JvnkQNLx/aaGQbj4lZAS/2hqHERlrQwuZ1Th5FATJX/ELsAqaXmNKeHAsJh+hz8xWO16pokcjSSO2fm3oqt+JR5kfVbUjVJEVZcVdWOkrUNZn9Vs/EJTWjEqvpXNdZWIN5voQejgSjdYq7ofL5p6gsnoo+O9bKyr/ECQ1X/ZBc/Ol0n+AMCmp2XT/YosP+0uBybPlZIXmhoHoWWoxX+OZsWLGx0cdl7w89l03c/W54pjXCeH5IITI9V+XTQXP8dY6qHlxsqTspZXmGgfLnZQ2bYgfztb7uuj7dm6stCypq4wHWf1yx8weYGY7S6/h8LFuqIL2/OfYjIG2fnmn43mtrwym4Zdmb7Wy8PJoQZ0D8Fb2A2ltvySKenAQAfmPfNfYk8Oi1qYqNHQouSqvf0JE/MrrN9KyW4ch5Y3sTlWqvM6E3cD6ydp8dU8pghaTlyelRaXm8h6qLj4ik7JXzdRfcpOKNQHXBe6N5Z2yrvfVgot/gdbnxVNW8j+uCFdB65uVxxcnKtdG+tffNF9Dq4Mq0R8zkT2UeI/srFW3PIGY2Ru03Hsgm+iSWEpeb5/gpj/E+MZDW6erVSnZaKoBVZ+Zcu1HipvNIp9JpLKn+FjjMpQ8mQ2p6cL+1d9dVDx2/hyMiXyRhPVh4vrKd5gouqh5W/w5RitFOnMaWx9VtxV/aScHJT8CFu/FQcXZ6XF3SaqPloWd2kmWas2hK76uVhXiXiviQZjhzZobqE3EW14k8jy7jPM0PCkZQfBrLnuUnUATuK7TGQfLs6TONpEdmFjjBJ5rokaRIkz2JyeGp4cdLvNl0NiHuFl46y2vNRE1SOVZ/PlGK0U1L3F1WeViBNNZJ9JOTnQPUKufisOLs5Kd+4wUfVRWeuAK4ukO3zrsXQ7C5S06Z5T8yfnQAGXTT2JXdBNRE/ZrNWVUnazORH3mKg+iSi/fzMnzjSRtLNoNsaK64rSJX3fSvyFiRokleexOSshLX5oau3DxfVU436Jy6gnh7R9fNbiG/4x2kLFLzM19Bn3ySHdclY27TX68BuKg4uzGurk0LmOLYtE3Y5F7IiPybbtZg8zaPl7Uat14P+8u+rR4nZ2ATfR3Jub3SgbhqvWvzRa2LA9WmpdEy2u/3K00NoXLZ3+KKvF9XdEV5wy6h9xDinfKAX/fwo21pGF87nioMeIuVhS2JJx0fJ8NmclpDufNLX24eJ6mjnBRNVj2JND1b2dkbVCJ4f8xm6N/yCNIg4uzoq7AKhCyT9ly+opPcRE8lDrdphjlRbLpgTQGHrWmFuoTZTIzaa00VlobcsO7t9mD/p1tbB+sN+7KUn7Jey8WhWhxSIbb6XFByIVf5n1WdGjixzJ+c9j462K/t+xP1sOc/FrTa19uLieGp4cqk50IdvE0Wzc2LUCJwfd+SibN25xcHFWQ50cSloOuSpODi7Jludl5TV8m0B28URPLoGGKHkzu0Drim4SDsvCae/JDugPDhzgR9E4SMR2dl6tyuDi64reZ1XMIWyOldtt5ZJWXQA0vOfQFLZOo7L/RnA0PTkkccWjnOLuaPbCF+Y3QItOrkTlCZY5OYzy4r2dW/49m+NKi/+ZTdex0fZN5f84VvGn2XwrDi7Oiq7gm5LGf8OWRSrrVqqCHnemkxVXLifqmqW3A4AGNPmXdCgt32JKqcO6aLH1GfagPqoWWo/k3U/jQMkb2XklaXGDieLZJU9l8+qIDlJlJKWPkfJ/KKp8oV/7eBO5MrB1GqnOy01UPdIGT22l4iw2pqf2aSaymqqnlfgb0sM/YZZ2iu93dQ+m9e/zVXXpcHBxVsO8eC8t+SOnjps//VSEFveydYQCDaHXPXALskpzm6u/q7B42oujpdbD7EF9XLr8JP/pnlHg5tOq6t+4hIq/zeaWScX/12QXU9V3zrFT/Bwba5XID5vIlYGr0yoRm0xUPZL4Q2w5Vi70pzcuxqoJ1B3IlWFFXR0ho50c+BySFt83UfWouqHLUfU6l7JWFgdXhpWOy19DMgw6/v9sXVZa4suSjRnmoFbWTFtonckeyMetd7/yiabG8cDNZ0/irSaqmIunj+JzS7Qjrp4HLa9ic62K4GJd5Tf7gkdnm5D/0S4+xoz50M7P1WmVtM8zkeWkJTfkrVzo39BcjFUi76v1b9lZUf0qdY5d8ZvYWCslLjWRg1Q9fprWuEAhdKf8IKnkbSbSJ2lvYuNdUYu0CuryKnv9C4m72ErbJ5mh4dByB1tXT+JdJhI0Yq7zWn6BMir6sM3yqc9iD+Lj1uJp15kaxws3r1YqfrWJKkd1Ps7mc0ri95mscrSYYvOtipiTr2Ljxy2Oqn+7jlMhSv6YjQul5D9l0/nfsoPpBdlJLs4OHu/JlvUtbGyoJMvlyF8FwsSXyVL37QW681A27dflJ5o0a4XpeGt+YqnbvTIriv8PpMQ32Jxxi4OLG6uyizcwAvQYGLtgHXF9n/SoKXcgH6cWN/wkSk9amY/dVP7/Q/yciSyHPsZT5zFE2sHr9iHTe3a4Mqy4dxtZ6OYvlzNOFUH/hObixy0OekUHFzsOcX9udKF/8XJ5RXKhD0ZxMeOSFr9maiqm6h/po4i6rrZu5d87xsWPS9SiBGNil3wDu5BVHL7obN2K31dY2EA3g1f2T3dVffRNul/S+O18GY7o1Rh12XHOE9kyrHZtfpaJLIY+jJK/NI3JH1VVzFU86lslLX6PtVsVQfPc9M9UVbpk+hmm9HLonhyXz4lDizk2dljlXcdR/UdHibm4w5Y1rKjbtQwuZ1Rp8TumdLAiaPFXZkF/x1i67H3FCezBfCxqfS9618lPMjWBlYA+nqPlH2Tr9fa8K4beFRW2eujts/SoLX3nWokbs9hfzVtHw7J145H5I470OCl34KZvNajOjdFlM/11r0d4xNhnXTYv52flX5/PMz0OqcQ9mX6aDd/bnU/5o6xVd0d+c5PqHcdX1ujCg76sSMtYi335fKvOA/l4IqSJKoe6nLRMM92U5d+ZlXN3Pr003TT9+Xx0fpCVeVum67JyzzKZ40W3s+WXlU/HgnyboOVF05ItS3qXkhK3ZjFX17o3UYVui2yevpDPbz5/wfZJy5EeU+3Wf3vWSv7DaFdnPE8ughG4/NSj+YP6kFo8/dvR4obx/bEOrB1UfIl3MggFAJhg6L8GS60d0ULr6kz/kA1/K1rYcHdXrduz8X/Kfj8WLax/R7S4/rX5+98BqIMWf8+eFKwAAAAcZNS5OQoAAGCV4f6Bj/qLu3381Id8a9YiuCVK4q9kv1/NRa90oRunFOMe/MtEXyQDAACwylDZwZ87qI9HrzG1AAAAWFWUfep0GOV/9BKnm9IBAACsWuij96n8cKTkl6K6r12mP7Ep8bfZsI62nTu+92cBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgVRJF/wrCU//vE37WpQAAAABJRU5ErkJggg==';

  function buildStandaloneHtml({ title, cardsHtml, cssText, editableViewJsText }) {
    return (
      '<!doctype html>\n' +
      '<html lang="es">\n' +
      '<head>\n' +
      '<meta charset="UTF-8" />\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
      `<title>${title}</title>\n` +
      '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
      '<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />\n' +
      `<style>\n${cssText}\n</style>\n` +
      '</head>\n' +
      '<body>\n' +
      '<header class="topbar no-print">\n' +
      `  <div class="topbar-brand"><img class="brand-logo" src="${MEGALABS_LOGO_DATA_URI}" alt="Megalabs" /><span class="brand-name">Informe consolidado</span></div>\n` +
      '</header>\n' +
      '<main id="app">\n' +
      '  <div class="consolidated-toolbar no-print">\n' +
      '    <div class="view-toggle">\n' +
      '      <button type="button" class="view-toggle-btn active" id="btnVertical">Vertical</button>\n' +
      '      <button type="button" class="view-toggle-btn" id="btnPresent">Presentación</button>\n' +
      '    </div>\n' +
      '    <div class="consolidated-actions">\n' +
      '      <div class="present-nav" id="presentNav">\n' +
      '        <button type="button" class="btn btn-ghost" id="presentPrev">←</button>\n' +
      '        <span class="present-nav-count" id="presentCount">1 / 1</span>\n' +
      '        <button type="button" class="btn btn-ghost" id="presentNext">→</button>\n' +
      '      </div>\n' +
      '      <button type="button" class="btn btn-ghost" id="btnAddBlank">+ Nota</button>\n' +
      '      <button type="button" class="btn btn-primary" id="btnPrint">Exportar a PDF</button>\n' +
      '    </div>\n' +
      '  </div>\n' +
      `  <div class="consolidated-list" id="consolidatedList">${cardsHtml}</div>\n` +
      '</main>\n' +
      `<script>\n${editableViewJsText}\n</script>\n` +
      '<script>\n' +
      "document.addEventListener('DOMContentLoaded', function () {\n" +
      "  var container = document.getElementById('consolidatedList');\n" +
      '  EditableView.wireInteractions(container, {\n' +
      "    addBlankButton: document.getElementById('btnAddBlank'),\n" +
      "    verticalButton: document.getElementById('btnVertical'),\n" +
      "    presentButton: document.getElementById('btnPresent'),\n" +
      "    presentNav: document.getElementById('presentNav'),\n" +
      "    presentPrev: document.getElementById('presentPrev'),\n" +
      "    presentNext: document.getElementById('presentNext'),\n" +
      "    presentCount: document.getElementById('presentCount'),\n" +
      "    printButton: document.getElementById('btnPrint'),\n" +
      '  });\n' +
      '});\n' +
      '</script>\n' +
      '</body>\n' +
      '</html>\n'
    );
  }

  return { buildStandaloneHtml };
});
